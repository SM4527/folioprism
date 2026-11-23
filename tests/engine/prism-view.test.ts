import Decimal from 'decimal.js';
import { describe, it, expect } from 'vitest';
import { allocation } from '../../src/lib/engine/prism-view/allocation';
import { fees } from '../../src/lib/engine/prism-view/fees';
import { scaled } from '../../src/lib/engine/prism-view/weights';
import { styleBox, styleCell } from '../../src/lib/engine/prism-view/style';
import { valuation } from '../../src/lib/engine/prism-view/valuation';
import { computePrismView, serializePrismView } from '../../src/lib/engine/prism-view';
import { ALLOCATION_KEYS, STYLE_SIZES, STYLE_STYLES } from '../../src/lib/engine/taxonomy';
import { curatedAggregates } from '../../src/lib/market/mock';
import { curatedWithStyle } from '../../src/lib/market/stock-facts';
import { classifyUniverse } from '../../src/lib/engine/prism-view/classify';
import { fundStyleBox } from '../../src/lib/engine/prism-view/fund-style';
import type { PrismViewInput } from '../../src/lib/engine/prism-view/types';
import { loadPrismViewFixture } from './load-fixture';

const fixed = (r: Record<string, Decimal>, dp = 1) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.toFixed(dp)]));
const total = (values: Decimal[]) => Decimal.sum(0, ...values).toFixed(1);

function lcg(seed: number) {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state;
  };
}

describe('allocation', () => {
  it('splits prism-view-basic and sums to exactly 100.0', () => {
    const a = allocation(loadPrismViewFixture('prism-view-basic'));
    expect(fixed(a)).toEqual({ cash: '2.1', usStock: '69.6', nonUsStock: '1.9', bond: '23.2', other: '3.2' });
    expect(total(Object.values(a))).toBe('100.0');
  });

  it('puts a stock with null facts or null country in other', () => {
    const input: PrismViewInput = {
      holdings: [
        { ticker: 'AAA', kind: 'STOCK', valueCents: '100' },
        { ticker: 'BBB', kind: 'STOCK', valueCents: '100' },
      ],
      funds: {},
      stocks: {
        AAA: null,
        BBB: { sector: null, country: null, marketCapMil: null, pe: null, pb: null, ps: null, pcf: null },
      },
    };
    expect(fixed(allocation(input)).other).toBe('100.0');
  });

  it('counts a money-market fund as 100% cash', () => {
    const input: PrismViewInput = { holdings: [{ ticker: 'SPAXX', kind: 'CASH', valueCents: '5000' }], funds: {}, stocks: {} };
    expect(fixed(allocation(input)).cash).toBe('100.0');
  });

  it('rescales a fund block that sums to 99.6', () => {
    const base = loadPrismViewFixture('prism-view-basic');
    const vti = base.funds.VTI!;
    const input: PrismViewInput = {
      ...base,
      funds: { ...base.funds, VTI: { ...vti, assetAllocation: { ...vti.assetAllocation!, usStock: '98.5' } } },
    };
    expect(total(Object.values(allocation(input)))).toBe('100.0');
    expect(Decimal.sum(0, ...Object.values(scaled({ a: '50', b: '49.6' })!)).toString()).toBe('100');
  });

  it('returns all zeros for a zero total', () => {
    const a = allocation({ holdings: [], funds: {}, stocks: {} });
    expect(Object.keys(a)).toEqual([...ALLOCATION_KEYS]);
    expect(Object.values(fixed(a))).toEqual(['0.0', '0.0', '0.0', '0.0', '0.0']);
  });

  it('always sums to exactly 100.0 over 200 random portfolios', () => {
    const base = loadPrismViewFixture('prism-view-basic');
    const next = lcg(42);
    for (let run = 0; run < 200; run++) {
      const holdings = base.holdings.map((h) => ({ ...h, valueCents: String(next() % 10_000_000) }));
      const a = allocation({ ...base, holdings });
      expect(total(Object.values(a))).toBe('100.0');
    }
  });
});

describe('fees', () => {
  it('weights expense ratios and lists unknown tickers', () => {
    const f = fees(loadPrismViewFixture('prism-view-basic'));
    expect(f.expenseRatioPct.toFixed(4)).toBe('0.0258');
    expect(f.feeCents).toBe(1650n);
    expect(f.unknownTickers).toEqual(['XFND']);
  });

  it('is zero for a zero total', () => {
    const f = fees({ holdings: [], funds: {}, stocks: {} });
    expect(f.expenseRatioPct.toFixed(4)).toBe('0.0000');
    expect(f.feeCents.toString()).toBe('0');
  });
});

const stock = (pe: string | null, marketCapMil: string | null = null) => ({
  sector: null,
  country: 'United States',
  marketCapMil,
  pe,
  pb: null,
  ps: null,
  pcf: null,
});

const curatedOnly = (ticker: string): PrismViewInput => ({
  holdings: [{ ticker, kind: 'FUND', valueCents: '1000000' }],
  funds: { [ticker]: curatedAggregates(ticker)! },
  stocks: {},
});

const styleSum = (s: NonNullable<ReturnType<typeof styleBox>>) =>
  total([...STYLE_SIZES.flatMap((size) => STYLE_STYLES.map((st) => s.cells[size][st])), s.notClassified]);

describe('styleCell', () => {
  it('sizes by market cap and styles by P/B', () => {
    expect(styleCell('3400000', '48')).toEqual({ size: 'large', style: 'growth' });
    expect(styleCell('5000', '1.2')).toEqual({ size: 'mid', style: 'value' });
    expect(styleCell('1500', '3')).toEqual({ size: 'small', style: 'blend' });
    expect(styleCell('10000', '3')).toEqual({ size: 'large', style: 'blend' });
    expect(styleCell('2000', '3')).toEqual({ size: 'mid', style: 'blend' });
  });

  it('puts null or negative P/B in blend and null market cap in Not classified', () => {
    expect(styleCell('5000', null)?.style).toBe('blend');
    expect(styleCell('5000', '-2')?.style).toBe('blend');
    expect(styleCell(null, '1')).toBeNull();
  });

  it('lets an explicit style win over P/B while the cap still sets the size', () => {
    expect(styleCell('5000', '1.2', 'growth')).toEqual({ size: 'mid', style: 'growth' });
    expect(styleCell(null, null, 'growth')).toBeNull();
  });
});

describe('styleBox', () => {
  it('spreads a fund styleBox and sums to exactly 100.0 on prism-view-basic', () => {
    const s = styleBox(loadPrismViewFixture('prism-view-basic'))!;
    expect(styleSum(s)).toBe('100.0');
    expect(s.notClassified.toFixed(1)).toBe('2.3'); // VTI's box covers 99.9%: the 0.1% gap is not scaled away
    expect(s.cells.small.growth.gt(0)).toBe(true);
  });

  it('leans value for a cheap, high-yield fund and growth for an expensive one (made-up universe)', () => {
    const f = (pe: string, pb: string, divYieldPct: string) => ({ marketCapMil: '50000', pe, pb, divYieldPct });
    const universe = classifyUniverse({
      CHP1: f('8', '0.9', '5'), CHP2: f('9', '1.1', '4'),
      MID1: f('18', '3', '1.5'), MID2: f('20', '3.5', '1.2'),
      EXP1: f('70', '25', '0'), EXP2: f('90', '30', '0'),
    });
    const fund = (box: ReturnType<typeof fundStyleBox>) => ({ ...curatedAggregates('VTI')!, styleBox: box });
    const one = (box: ReturnType<typeof fundStyleBox>): PrismViewInput => ({
      holdings: [{ ticker: 'ZFND', kind: 'FUND', valueCents: '1000000' }],
      funds: { ZFND: fund(box) },
      stocks: {},
    });
    const value = styleBox(one(fundStyleBox([{ ticker: 'CHP1', weightPct: '60' }, { ticker: 'CHP2', weightPct: '30' }, { ticker: 'EXP1', weightPct: '10' }], universe)))!;
    const growth = styleBox(one(fundStyleBox([{ ticker: 'EXP1', weightPct: '50' }, { ticker: 'EXP2', weightPct: '40' }, { ticker: 'MID1', weightPct: '10' }], universe)))!;
    expect(value.cells.large.value.toFixed(1)).toBe('90.0');
    expect(growth.cells.large.growth.toFixed(1)).toBe('90.0');
    expect(styleSum(value)).toBe('100.0');
  });

  it('keeps the D-10 single-cell fallback for a fund without styleBox', () => {
    const input = curatedOnly('VTI');
    input.funds.VTI = { ...curatedAggregates('VTI')!, styleBox: null };
    const vti = styleBox(input)!;
    expect(vti.cells.large.blend.toFixed(1)).toBe('100.0');
    expect(styleSum(vti)).toBe('100.0');
  });
});

describe('valuation', () => {
  it('uses a weighted harmonic mean that skips null and negative values', () => {
    const input: PrismViewInput = {
      holdings: ['A', 'B', 'C', 'D'].map((ticker) => ({ ticker, kind: 'STOCK' as const, valueCents: '100' })),
      funds: {},
      stocks: { A: stock('10'), B: stock('30'), C: stock(null), D: stock('-5') },
    };
    expect(valuation(input)!.pe!.toFixed(2)).toBe('15.00');
  });

  it('uses a weighted geometric mean for market cap', () => {
    const input: PrismViewInput = {
      holdings: ['A', 'B'].map((ticker) => ({ ticker, kind: 'STOCK' as const, valueCents: '100' })),
      funds: {},
      stocks: { A: stock(null, '1000'), B: stock(null, '4000') },
    };
    const v = valuation(input)!;
    expect(v.marketCapMil!.toFixed(2)).toBe('2000.00');
    expect(v.pe).toBeNull();
    expect(v.pb).toBeNull();
  });
});

describe('computePrismView', () => {
  it('gives null style and valuation with no NaN for a zero-equity portfolio', () => {
    const r = computePrismView(loadPrismViewFixture('prism-view-no-equity'));
    expect(r.styleBox).toBeNull();
    expect(r.valuation).toBeNull();
    expect(fixed(r.allocation)).toEqual({ cash: '20.8', usStock: '0.0', nonUsStock: '0.0', bond: '79.2', other: '0.0' });
    expect(r.fees.feeCents).toBe(600n);
    expect(JSON.stringify(serializePrismView(r, null))).not.toContain('NaN');
  });

  it('serializes portfolio and benchmark at their display precision', () => {
    const p = computePrismView(loadPrismViewFixture('prism-view-basic'));
    const spy: PrismViewInput = { ...curatedOnly('SPY'), funds: { SPY: curatedWithStyle('SPY')! } };
    const s = serializePrismView(p, computePrismView(spy));
    expect(s.allocation.portfolio.usStock).toBe('69.6');
    expect(s.styleBox.portfolio!.notClassified).toBe('2.3');
    expect(s.valuation.portfolio!.pe).toMatch(/^\d+\.\d{2}$/);
    expect(s.fees.portfolio).toEqual({ expenseRatioPct: '0.0258', feeCents: '1650', unknownTickers: ['XFND'] });
    const bench = s.styleBox.benchmark!;
    const shown = [...Object.values(bench.cells).flatMap((row) => Object.values(row)), bench.notClassified];
    expect(shown.every((v) => /^\d+\.\d$/.test(v))).toBe(true);
    expect(Decimal.sum(...shown).toFixed(1)).toBe('100.0');
    expect(bench.fallbackTickers).toEqual([]);
  });

  it('sets every benchmark field to null without a benchmark', () => {
    const s = serializePrismView(computePrismView(loadPrismViewFixture('prism-view-basic')), null);
    expect([s.allocation, s.styleBox, s.valuation, s.fees].map((p) => p.benchmark)).toEqual([null, null, null, null]);
  });
});
