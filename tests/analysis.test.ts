import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { buildAnalysis } from '../src/lib/analysis';
import type { FundHoldings } from '../src/lib/market/types';
import type { HoldingRow } from '../src/lib/holdings';
import type { MarketQuote, QuoteResult, StockMetadata } from '../src/lib/market/types';
import type { FundAggregates } from '../src/lib/engine/xray/types';
import { curatedAggregates } from '../src/lib/market/mock';
import { toCents } from '../src/lib/engine/normalize';
import { BENCHMARK_TICKERS } from '../src/lib/benchmarks';

const portfolio = { name: 'My Portfolio', benchmarkTicker: 'SPY' };

/** The market data buildAnalysis reads besides quotes. */
function market(
  funds: Record<string, FundHoldings> = {},
  metadata: Record<string, StockMetadata | null> = {},
  benchmark: FundAggregates | null = null,
) {
  return { funds, metadata, benchmark };
}

function ok(price: string, quoteType: string, source: MarketQuote['source'], stale: boolean): QuoteResult {
  return {
    status: 'ok',
    quote: { price, currency: 'USD', name: 'n', quoteType, asOf: '2026-11-18T21:00:00.000Z', source, stale },
  };
}

const holdings: HoldingRow[] = [
  { id: 1, ticker: 'VTI', inputMode: 'DOLLARS', dollarAmount: '40000.00' },
  { id: 2, ticker: 'FXAIX', inputMode: 'DOLLARS', dollarAmount: '30000.00' },
  { id: 3, ticker: 'AAPL', inputMode: 'SHARES', shares: '25' },
];

const quotes = new Map<string, QuoteResult>([
  ['VTI', ok('359.48', 'ETF', 'yahoo', false)],
  ['FXAIX', ok('254.77', 'MUTUALFUND', 'yahoo', false)],
  ['AAPL', ok('200.00', 'EQUITY', 'mock', true)],
]);

describe('buildAnalysis', () => {
  it('prices holdings and totals them in cents', () => {
    const a = buildAnalysis(portfolio, holdings, quotes, market(), false);
    expect(a.summary.totalCents).toBe('7500000');
    expect(a.summary.name).toBe('My Portfolio');
    expect(a.summary.benchmark).toBe('SPY');
    expect(a.summary.staleTickers).toEqual(['AAPL']);
    expect(a.summary.unpricedTickers).toEqual([]);
    expect(a.summary.asOf).toBe('2026-11-18T21:00:00.000Z');
    const aapl = a.holdings.find((h) => h.ticker === 'AAPL')!;
    expect(aapl.valueCents).toBe('500000');
    expect(aapl.livePrice).toBe('200.00');
    expect(aapl.stale).toBe(true);
    expect(aapl.source).toBe('mock');
    expect(a.holdings.find((h) => h.ticker === 'FXAIX')!.priceKind).toBe('NAV');
    expect(a.holdings.find((h) => h.ticker === 'VTI')!.priceKind).toBe('PRICE');
  });

  it('prices CASH at $1.00 with a value from its dollars', () => {
    const cash: HoldingRow = { id: 4, ticker: 'CASH', inputMode: 'DOLLARS', dollarAmount: '1234.56' };
    const a = buildAnalysis(portfolio, [cash], new Map(), market(), false);
    expect(a.holdings[0]).toMatchObject({ livePrice: '1.00', priceKind: 'PRICE', asOf: null, source: null, stale: false, valueCents: '123456' });
    expect(a.summary.totalCents).toBe('123456');
  });

  it('leaves an unpriced SHARES holding out of the total and reports it', () => {
    const rows: HoldingRow[] = [...holdings, { id: 5, ticker: 'ZZZZZQ', inputMode: 'SHARES', shares: '10' }];
    const a = buildAnalysis(portfolio, rows, new Map([...quotes, ['ZZZZZQ', { status: 'unknown' }]]), market(), false);
    expect(a.holdings.find((h) => h.ticker === 'ZZZZZQ')).toMatchObject({ livePrice: null, valueCents: null });
    expect(a.summary.totalCents).toBe('7500000');
    expect(a.summary.unpricedTickers).toEqual(['ZZZZZQ']);
  });
});

describe('buildAnalysis cash and money markets', () => {
  const rows: HoldingRow[] = [
    { id: 1, ticker: 'CASH', inputMode: 'DOLLARS', dollarAmount: '1000.00' },
    { id: 2, ticker: 'VMFXX', inputMode: 'SHARES', shares: '2000' },
    { id: 3, ticker: 'VTI', inputMode: 'DOLLARS', dollarAmount: '7000.00' },
  ];
  const vti = fund('Vanguard Total Stock Market ETF', [['AAPL', '6.1'], ['MSFT', '5.3']]);
  const a = buildAnalysis(portfolio, rows, new Map(), market({ VTI: vti }), false);

  it('values a SHARES money market at a $1.00 NAV without a quote', () => {
    expect(a.summary.totalCents).toBe('1000000');
    expect(a.summary.unpricedTickers).toEqual([]);
    expect(a.holdings.find((h) => h.ticker === 'VMFXX')).toMatchObject({ livePrice: '1.00', priceKind: 'NAV', valueCents: '200000' });
  });

  it('counts cash and money markets as cash, never as intersection rows', () => {
    expect(a.xray.allocation.portfolio.cash).toBe('30.0');
    const tickers = a.intersection.rows.flatMap((r) => [r.ticker, ...r.children.map((c) => c.sourceTicker)]);
    expect(tickers).not.toContain('CASH');
    expect(tickers).not.toContain('VMFXX');
    for (const r of a.intersection.rows) {
      expect(r.children.reduce((s, c) => s + BigInt(c.valueCents), 0n)).toBe(BigInt(r.valueCents));
      expect(Decimal.sum(0, ...r.children.map((c) => c.portfolioPctDisplay)).eq(r.portfolioPctDisplay)).toBe(true);
    }
  });
});

describe('BENCHMARK_TICKERS', () => {
  it('lists the five selectable benchmarks', () => {
    expect(BENCHMARK_TICKERS).toEqual(['SPY', 'VTI', 'AGG', 'VT', 'VXUS']);
  });
});

/** A fund whose constituents are [ticker, weightPct] pairs. */
function fund(name: string, weights: [string, string][], extra: Partial<FundHoldings> = {}): FundHoldings {
  return {
    name,
    source: 'curated',
    constituents: weights.map(([ticker, weightPct]) => ({ ticker, name: ticker, weightPct })),
    aggregates: null,
    ...extra,
  };
}

const funds: Record<string, FundHoldings> = {
  VTI: fund('Vanguard Total Stock Market ETF', [['AAPL', '6.1'], ['MSFT', '5.3'], ['GOOGL', '2.9'], ['GOOG', '2.3'], ['NVDA', '63.4']]),
  FXAIX: fund('Fidelity 500 Index Fund', [['AAPL', '7.03'], ['GOOGL', '3.01'], ['GOOG', '2.4'], ['NVDA', '77.56']]),
};

describe('buildAnalysis intersection', () => {
  const a = buildAnalysis(portfolio, holdings, quotes, market(funds), false);

  it('rows sum exactly to their children in cents and 2dp percent', () => {
    expect(a.intersection.rows.length).toBeGreaterThan(0);
    for (const r of a.intersection.rows) {
      expect(r.children.reduce((s, c) => s + BigInt(c.valueCents), 0n)).toBe(BigInt(r.valueCents));
      expect(Decimal.sum(0, ...r.children.map((c) => c.portfolioPctDisplay)).eq(r.portfolioPctDisplay)).toBe(true);
    }
    const aapl = a.intersection.rows.find((r) => r.ticker === 'AAPL')!;
    expect(aapl.children.map((c) => c.sourceTicker).sort()).toEqual(['AAPL', 'FXAIX', 'VTI']);
  });

  it('keeps GOOG and GOOGL apart unless share classes are merged', () => {
    expect(a.intersection.rows.some((r) => r.ticker === 'GOOG')).toBe(true);
    const merged = buildAnalysis(portfolio, holdings, quotes, market(funds), true);
    expect(merged.intersection.rows.some((r) => r.ticker === 'GOOG')).toBe(false);
    expect(merged.intersection.rows.some((r) => r.ticker === 'GOOGL')).toBe(true);
  });

  it('lists funds then direct stocks in coverage, each sorted by ticker', () => {
    expect(a.intersection.coverage.items).toEqual([
      { ticker: 'FXAIX', coveredPct: '90.0000', source: 'curated', unavailable: false, sourceUrl: null, holdingsAsOf: null, asOfOrigin: null, curated: false },
      { ticker: 'VTI', coveredPct: '80.0000', source: 'curated', unavailable: false, sourceUrl: null, holdingsAsOf: null, asOfOrigin: null, curated: false },
      { ticker: 'AAPL', coveredPct: '100.0000', source: 'direct', unavailable: false, sourceUrl: null, holdingsAsOf: null, asOfOrigin: null, curated: false },
    ]);
  });

  it('carries each fund provenance into its coverage item', () => {
    const provenance = { url: 'https://www.sec.gov/x.xml', asOf: '2026-06-30', asOfOrigin: 'curated' as const, curated: true };
    const withProv = { ...funds, VTI: fund('Vanguard Total Stock Market ETF', funds.VTI.constituents.map((c) => [c.ticker, c.weightPct]), { provenance }) };
    const item = buildAnalysis(portfolio, holdings, quotes, market(withProv), false).intersection.coverage.items.find((i) => i.ticker === 'VTI');
    expect(item).toMatchObject({ sourceUrl: provenance.url, holdingsAsOf: '2026-06-30', asOfOrigin: 'curated', curated: true });
  });

  it('weights fund coverage by fund value', () => {
    expect(a.intersection.coverage.fundCoveredPct).toBe('84.2857');
    expect(a.intersection.coverage.fundOtherPct).toBe('15.7143');
  });

  it('reports a failed fund as 0% covered and unavailable', () => {
    const failed = { ...funds, VTI: fund('Vanguard Total Stock Market ETF', [], { source: 'yahoo-top10', unavailable: true }) };
    const item = buildAnalysis(portfolio, holdings, quotes, market(failed), false).intersection.coverage.items.find((i) => i.ticker === 'VTI');
    expect(item).toEqual({ ticker: 'VTI', coveredPct: '0.0000', source: 'yahoo-top10', unavailable: true, sourceUrl: null, holdingsAsOf: null, asOfOrigin: null, curated: false });
  });

  it('has null fund coverage when no funds are held, and skips CASH', () => {
    const rows: HoldingRow[] = [holdings[2], { id: 4, ticker: 'CASH', inputMode: 'DOLLARS', dollarAmount: '100.00' }];
    const b = buildAnalysis(portfolio, rows, quotes, market(), false);
    expect(b.intersection.coverage.fundCoveredPct).toBeNull();
    expect(b.intersection.coverage.fundOtherPct).toBeNull();
    expect(b.intersection.coverage.items.map((i) => i.ticker)).toEqual(['AAPL']);
    expect(b.intersection.rows.map((r) => r.ticker)).toEqual(['AAPL']);
  });

  it('has null fund coverage, not NaN, when every held fund is worth $0', () => {
    const rows: HoldingRow[] = [holdings[2], { id: 6, ticker: 'VTI', inputMode: 'SHARES', shares: '10' }];
    const zero = new Map([...quotes, ['VTI', ok('0', 'ETF', 'yahoo', false)]]);
    const c = buildAnalysis(portfolio, rows, zero, market(funds), false).intersection.coverage;
    expect(c.fundCoveredPct).toBeNull();
    expect(c.fundOtherPct).toBeNull();
  });

  it('never adds a fund holding as a direct stock exposure', () => {
    expect(a.intersection.rows.some((r) => r.ticker === 'VTI' || r.ticker === 'FXAIX')).toBe(false);
  });
});

describe('buildAnalysis xray (D-14, D-16)', () => {
  const rows: HoldingRow[] = [
    { id: 1, ticker: 'VTI', inputMode: 'DOLLARS', dollarAmount: '40000.00' },
    { id: 3, ticker: 'AAPL', inputMode: 'SHARES', shares: '25' },
    { id: 4, ticker: 'CASH', inputMode: 'DOLLARS', dollarAmount: '1000.00' },
  ];
  const vti = fund('Vanguard Total Stock Market ETF', [['AAPL', '6.1']], { aggregates: curatedAggregates('VTI')! });
  const aapl: StockMetadata = {
    sector: 'technology',
    country: 'United States',
    marketCapMil: '5074783.31',
    pe: '38.8875',
    pb: '45.2755',
    ps: '10.5982',
    pcf: '34.9751',
  };
  const spy = curatedAggregates('SPY')!;
  const build = (benchmark: FundAggregates | null, hs = rows, q = quotes, meta: StockMetadata | null = aapl) =>
    buildAnalysis(portfolio, hs, q, market({ VTI: vti }, { AAPL: meta }, benchmark), false).xray;
  const sum = (o: Record<string, string>) => Decimal.sum(0, ...Object.values(o));

  it('sums portfolio and benchmark allocation to exactly 100.0', () => {
    const x = build(spy);
    expect(sum(x.allocation.portfolio).eq(100)).toBe(true);
    expect(sum(x.allocation.benchmark!).eq(100)).toBe(true);
    expect(x.valuation.portfolio!.pe).not.toBeNull();
    expect(x.valuation.benchmark!.pe).not.toBeNull();
  });

  it('has no benchmark valuation and mostly bonds for AGG', () => {
    const x = build(curatedAggregates('AGG')!);
    expect(x.valuation.benchmark).toBeNull();
    expect(new Decimal(x.allocation.benchmark!.bond).gt(90)).toBe(true);
  });

  it('nulls every benchmark field without benchmark aggregates', () => {
    const x = build(null);
    expect([x.allocation, x.styleBox, x.valuation, x.fees].map((p) => p.benchmark)).toEqual([null, null, null, null]);
  });

  it('charges the benchmark fee on the portfolio total', () => {
    const x = build(spy);
    const total = new Decimal(4600000);
    expect(x.fees.benchmark!.feeCents).toBe(toCents(total.times(spy.expenseRatioPct!).div(100)).toString());
  });

  it('puts a direct stock without metadata in other and Not classified', () => {
    const only: HoldingRow[] = [rows[1]];
    const x = build(null, only, quotes, null);
    expect(x.allocation.portfolio.other).toBe('100.0');
    expect(x.styleBox.portfolio!.notClassified).toBe('100.0');
  });

  it('leaves unpriced SHARES holdings out of xray', () => {
    const extra: HoldingRow[] = [...rows, { id: 5, ticker: 'ZZZZZQ', inputMode: 'SHARES', shares: '10' }];
    const q = new Map([...quotes, ['ZZZZZQ', { status: 'unknown' } as QuoteResult]]);
    expect(build(spy, extra, q)).toEqual(build(spy));
  });
});
