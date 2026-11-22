import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_PROVENANCE, type MarketQuote } from '../src/lib/market/types';
import mockFunds from '../data/mock-funds.json';

vi.mock('../src/lib/market/yahoo', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/market/yahoo')>('../src/lib/market/yahoo');
  return {
    toMarketQuote: actual.toMarketQuote,
    toFundHoldings: actual.toFundHoldings,
    toFundAggregates: actual.toFundAggregates,
    toStockMetadata: actual.toStockMetadata,
    yahooSymbol: actual.yahooSymbol,
    fetchYahooQuotes: vi.fn(),
    fetchYahooHoldings: vi.fn(),
    fetchYahooMetadata: vi.fn(),
  };
});

vi.mock('../src/lib/market/cache', () => ({ readCache: vi.fn(), writeCache: vi.fn() }));

vi.mock('../src/lib/market/google', () => ({ fetchGoogleQuote: vi.fn() }));

const {
  toMarketQuote,
  toFundHoldings,
  toFundAggregates,
  toStockMetadata,
  yahooSymbol,
  fetchYahooQuotes,
  fetchYahooHoldings,
  fetchYahooMetadata,
} = await import('../src/lib/market/yahoo');
const { readCache, writeCache } = await import('../src/lib/market/cache');
const { fetchGoogleQuote } = await import('../src/lib/market/google');
const { getQuotes, getQuote, getHoldings, getMetadata } = await import('../src/lib/market/index');
const { mockQuote, isCurated, curatedAggregates } = await import('../src/lib/market/mock');
const { tickerError } = await import('../src/lib/market/verify');

const fetchMock = vi.mocked(fetchYahooQuotes);
const holdingsMock = vi.mocked(fetchYahooHoldings);
const metadataMock = vi.mocked(fetchYahooMetadata);
const readMock = vi.mocked(readCache);
const writeMock = vi.mocked(writeCache);
const googleMock = vi.mocked(fetchGoogleQuote);

function yahooQuote(ticker: string, price: string, quoteType: string): MarketQuote {
  return {
    price,
    currency: 'USD',
    name: ticker,
    quoteType,
    asOf: '2026-11-18T21:00:00.000Z',
    source: 'yahoo',
    stale: false,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  holdingsMock.mockReset();
  metadataMock.mockReset();
  readMock.mockReset().mockResolvedValue(new Map());
  writeMock.mockReset().mockResolvedValue(undefined);
  googleMock.mockReset().mockResolvedValue('unreachable');
});

/** A cache row for `ticker` fetched `ageMin` minutes ago. */
function cacheRow(ticker: string, price: string, ageMin: number) {
  return [ticker, { payload: yahooQuote(ticker, price, 'EQUITY'), fetchedAt: new Date(Date.now() - ageMin * 60_000) }] as const;
}
afterEach(() => {
  delete process.env.MARKET_DATA_MODE;
});

describe('toMarketQuote', () => {
  const raw = {
    symbol: 'AAPL',
    regularMarketPrice: 290.12,
    regularMarketTime: new Date('2026-11-18T21:00:00Z'),
    currency: 'USD',
    longName: 'Apple Inc.',
    shortName: 'Apple',
    quoteType: 'EQUITY',
  };

  it('maps a Yahoo quote to a decimal-string MarketQuote', () => {
    expect(toMarketQuote(raw)).toEqual({
      ticker: 'AAPL',
      quote: {
        price: '290.12',
        name: 'Apple Inc.',
        quoteType: 'EQUITY',
        currency: 'USD',
        asOf: '2026-11-18T21:00:00.000Z',
        source: 'yahoo',
        stale: false,
      },
    });
  });

  it('falls back to shortName, then the symbol, for the name', () => {
    expect(toMarketQuote({ ...raw, longName: undefined })?.quote.name).toBe('Apple');
    expect(toMarketQuote({ ...raw, longName: undefined, shortName: undefined })?.quote.name).toBe('AAPL');
  });

  it('returns null when the price is missing', () => {
    expect(toMarketQuote({ ...raw, regularMarketPrice: undefined })).toBeNull();
  });

  it('returns null for an uncoerced epoch-seconds market time from a failed validation', () => {
    expect(toMarketQuote({ ...raw, regularMarketTime: 1795096281 as unknown as Date })).toBeNull();
  });

  it('maps BRK-B to the canonical ticker BRK.B', () => {
    expect(toMarketQuote({ ...raw, symbol: 'BRK-B' })?.ticker).toBe('BRK.B');
  });
});

describe('yahooSymbol', () => {
  it('maps a one-letter share class to a dash and keeps exchange suffixes', () => {
    expect(yahooSymbol('BRK.B')).toBe('BRK-B');
    expect(yahooSymbol('SHOP.TO')).toBe('SHOP.TO');
    expect(yahooSymbol('AAPL')).toBe('AAPL');
  });
});

describe('getQuotes', () => {
  it('returns Yahoo quotes from one batched call', async () => {
    fetchMock.mockResolvedValue(
      new Map([
        ['AAPL', yahooQuote('AAPL', '290.12', 'EQUITY')],
        ['FXAIX', yahooQuote('FXAIX', '254.77', 'MUTUALFUND')],
      ]),
    );
    const quotes = await getQuotes(['AAPL', 'FXAIX']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const t of ['AAPL', 'FXAIX']) {
      const r = quotes.get(t);
      expect(r?.status).toBe('ok');
      if (r?.status === 'ok') {
        expect(r.quote.source).toBe('yahoo');
        expect(r.quote.stale).toBe(false);
      }
    }
  });

  it('falls back to stale mock quotes when Yahoo is unreachable', async () => {
    fetchMock.mockResolvedValue(null);
    const quotes = await getQuotes(['AAPL', 'VTI']);
    for (const t of ['AAPL', 'VTI']) {
      const r = quotes.get(t);
      expect(r?.status).toBe('ok');
      if (r?.status === 'ok') {
        expect(r.quote.source).toBe('mock');
        expect(r.quote.stale).toBe(true);
      }
    }
  });

  it('reports unknown when Yahoo answered without the ticker', async () => {
    fetchMock.mockResolvedValue(new Map());
    expect((await getQuotes(['ZZZZZQ'])).get('ZZZZZQ')).toEqual({ status: 'unknown' });
  });

  it('reports unreachable when Yahoo failed and no mock exists', async () => {
    fetchMock.mockResolvedValue(null);
    expect((await getQuotes(['ZZZZZQ'])).get('ZZZZZQ')).toEqual({ status: 'unreachable' });
  });

  it('skips Yahoo in mock mode', async () => {
    process.env.MARKET_DATA_MODE = 'mock';
    const r = await getQuote('AAPL');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.quote.source).toBe('mock');
      expect(r.quote.stale).toBe(true);
    }
  });
});

describe('getQuotes cache (D-02)', () => {
  it('serves a fresh cache row without calling Yahoo', async () => {
    readMock.mockResolvedValue(new Map([cacheRow('AAPL', '290.12', 5)]));
    const r = await getQuote('AAPL');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
    expect(r).toEqual({ status: 'ok', quote: { ...yahooQuote('AAPL', '290.12', 'EQUITY'), source: 'cache', stale: false } });
  });

  it('refreshes an expired row from Yahoo and writes it once', async () => {
    readMock.mockResolvedValue(new Map([cacheRow('AAPL', '280.00', 20)]));
    const live = yahooQuote('AAPL', '290.12', 'EQUITY');
    fetchMock.mockResolvedValue(new Map([['AAPL', live]]));
    const r = await getQuote('AAPL');
    expect(fetchMock).toHaveBeenCalledWith(['AAPL']);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith('AAPL', 'QUOTE', live);
    expect(r).toEqual({ status: 'ok', quote: live });
  });

  it('returns the stale cache row when Yahoo is unreachable, without writing', async () => {
    readMock.mockResolvedValue(new Map([cacheRow('AAPL', '280.00', 2 * 24 * 60)]));
    fetchMock.mockResolvedValue(null);
    const r = await getQuote('AAPL');
    expect(writeMock).not.toHaveBeenCalled();
    expect(r).toEqual({ status: 'ok', quote: { ...yahooQuote('AAPL', '280.00', 'EQUITY'), source: 'cache', stale: true } });
  });

  it('uses the mock when Yahoo is unreachable and nothing is cached, without writing', async () => {
    fetchMock.mockResolvedValue(null);
    const r = await getQuote('AAPL');
    expect(writeMock).not.toHaveBeenCalled();
    expect(r.status === 'ok' && r.quote.source).toBe('mock');
    expect(r.status === 'ok' && r.quote.stale).toBe(true);
  });

  it('asks Yahoo only for tickers missing from the fresh cache', async () => {
    readMock.mockResolvedValue(new Map([cacheRow('AAPL', '290.12', 5)]));
    fetchMock.mockResolvedValue(new Map([['MSFT', yahooQuote('MSFT', '500.00', 'EQUITY')]]));
    await getQuotes(['AAPL', 'MSFT']);
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(['MSFT']);
  });

  it('ignores a cache row with an invalid payload', async () => {
    readMock.mockResolvedValue(new Map([['AAPL', { payload: { price: 12 }, fetchedAt: new Date() }]]));
    fetchMock.mockResolvedValue(null);
    const r = await getQuote('AAPL');
    expect(fetchMock).toHaveBeenCalledWith(['AAPL']);
    expect(r.status === 'ok' && r.quote.source).toBe('mock');
  });

  it('does not touch the cache in mock mode', async () => {
    process.env.MARKET_DATA_MODE = 'mock';
    await getQuotes(['AAPL', 'MSFT']);
    expect(readMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
  });
});

describe('getQuotes Google step (D-03)', () => {
  const google: MarketQuote = { ...yahooQuote('AAPL', '352.45', 'EQUITY'), source: 'google' };

  it('uses a Google price when Yahoo is unreachable, live and written as QUOTE', async () => {
    fetchMock.mockResolvedValue(null);
    googleMock.mockResolvedValue(google);
    expect(await getQuote('AAPL')).toEqual({ status: 'ok', quote: google });
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith('AAPL', 'QUOTE', google);
  });

  it('prefers Google over a stale cache row', async () => {
    readMock.mockResolvedValue(new Map([cacheRow('AAPL', '280.00', 2 * 24 * 60)]));
    fetchMock.mockResolvedValue(new Map());
    googleMock.mockResolvedValue(google);
    expect(await getQuote('AAPL')).toEqual({ status: 'ok', quote: google });
  });

  it('asks Google for every miss at once, not one after another', async () => {
    fetchMock.mockResolvedValue(null);
    let inFlight = 0;
    let peak = 0;
    googleMock.mockImplementation(async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return 'unreachable';
    });
    await getQuotes(['ZZZZZQ', 'ZZZZZR', 'ZZZZZS']);
    expect(peak).toBe(3);
  });

  it('asks Google only for tickers Yahoo did not return', async () => {
    fetchMock.mockResolvedValue(new Map([['MSFT', yahooQuote('MSFT', '500.00', 'EQUITY')]]));
    await getQuotes(['AAPL', 'MSFT']);
    expect(googleMock).toHaveBeenCalledTimes(1);
    expect(googleMock).toHaveBeenCalledWith('AAPL');
  });

  it('reports unknown when Yahoo answered and Google found nothing', async () => {
    fetchMock.mockResolvedValue(new Map());
    googleMock.mockResolvedValue('not-found');
    expect((await getQuotes(['ZZZZZQ'])).get('ZZZZZQ')).toEqual({ status: 'unknown' });
  });

  it('reports unknown when Yahoo was unreachable but Google answered without a price', async () => {
    fetchMock.mockResolvedValue(null);
    googleMock.mockResolvedValue('not-found');
    expect((await getQuotes(['ZZZZZQ'])).get('ZZZZZQ')).toEqual({ status: 'unknown' });
  });

  it('reports unreachable, not unknown, when Yahoo knows the ticker but has no price yet', async () => {
    fetchMock.mockResolvedValue(new Map([['ZZZZZQ', null]]));
    googleMock.mockResolvedValue('unreachable');
    expect((await getQuotes(['ZZZZZQ'])).get('ZZZZZQ')).toEqual({ status: 'unreachable' });
    expect(googleMock).toHaveBeenCalledWith('ZZZZZQ');
    googleMock.mockResolvedValue('not-found');
    expect((await getQuotes(['ZZZZZQ'])).get('ZZZZZQ')).toEqual({ status: 'unreachable' });
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('reports unreachable when neither Yahoo nor Google could be reached', async () => {
    fetchMock.mockResolvedValue(null);
    googleMock.mockResolvedValue('unreachable');
    expect((await getQuotes(['ZZZZZQ'])).get('ZZZZZQ')).toEqual({ status: 'unreachable' });
  });

  it('skips Google in mock mode', async () => {
    process.env.MARKET_DATA_MODE = 'mock';
    await getQuotes(['AAPL', 'ZZZZZQ']);
    expect(googleMock).not.toHaveBeenCalled();
  });
});

describe('mock data', () => {
  it('marks FXAIX as a mutual fund', () => {
    expect(mockQuote('FXAIX')?.quoteType).toBe('MUTUALFUND');
    expect(isCurated('FXAIX')).toBe(true);
    expect(isCurated('AAPL')).toBe(false);
  });

  it('has decimal-string prices everywhere', () => {
    const tickers = ['AAPL', 'MSFT', 'BRK.B', 'VTI', 'FXAIX', 'FSKAX', 'VOO', 'QQQ', 'SCHD', 'BND', 'SPY', 'AGG'];
    for (const t of tickers) expect(mockQuote(t)?.price).toMatch(/^\d+(\.\d+)?$/);
  });
});

describe('tickerError (D-12)', () => {

  it('names an unknown ticker', () => {
    expect(tickerError('ZZZZZQ', { status: 'unknown' })).toBe('Unknown ticker ZZZZZQ');
  });

  it('asks to retry when the ticker could not be verified', () => {
    expect(tickerError('ZZZZZQ', { status: 'unreachable' })).toBe(
      'Could not verify ZZZZZQ right now. Try again in a minute.',
    );
  });

  it('accepts a resolved quote', () => {
    expect(tickerError('AAPL', { status: 'ok', quote: yahooQuote('AAPL', '290.12', 'EQUITY') })).toBeNull();
  });

  it('rejects a quote that is not in USD', () => {
    const quote = { ...yahooQuote('VOD.L', '72.50', 'EQUITY'), currency: 'GBp' };
    expect(tickerError('VOD.L', { status: 'ok', quote })).toBe('Only USD-listed tickers are supported (VOD.L is in GBp)');
  });
});

describe('toFundHoldings (D-05)', () => {
  it('turns Yahoo holdingPercent fractions into 0-100 percent strings', () => {
    const top = { holdings: [{ symbol: 'TSM', holdingName: 'Taiwan Semiconductor', holdingPercent: 0.0312 }] };
    expect(toFundHoldings('VXUS', 'Vanguard Total International Stock ETF', top, undefined)).toMatchObject({
      name: 'Vanguard Total International Stock ETF',
      source: 'yahoo-top10',
      constituents: [{ ticker: 'TSM', name: 'Taiwan Semiconductor', weightPct: '3.12' }],
    });
  });

  it('canonicalizes tickers and drops entries without a symbol', () => {
    const top = {
      holdings: [
        { symbol: 'BRK-B', holdingName: 'Berkshire', holdingPercent: 0.02 },
        { symbol: '', holdingName: 'Cash', holdingPercent: 0.01 },
      ],
    };
    expect(toFundHoldings('X', 'X Fund', top, undefined)!.constituents).toEqual([{ ticker: 'BRK.B', name: 'Berkshire', weightPct: '2' }]);
  });

  it('returns null when Yahoo lists no usable holdings', () => {
    expect(toFundHoldings('BND', 'Vanguard Total Bond Market ETF', { holdings: [] }, undefined)).toBeNull();
    expect(toFundHoldings('X', 'X Fund', { holdings: [{ holdingName: 'Cash', holdingPercent: 0.01 }] }, undefined)).toBeNull();
  });

  it('drops entries whose holdingPercent is not a number instead of throwing', () => {
    const top = {
      holdings: [
        { symbol: 'AAPL', holdingName: 'Apple', holdingPercent: { raw: 0.07, fmt: '7%' } as unknown as number },
        { symbol: 'MSFT', holdingName: 'Microsoft', holdingPercent: 0.05 },
      ],
    };
    expect(toFundHoldings('X', 'X Fund', top, undefined)!.constituents).toEqual([{ ticker: 'MSFT', name: 'Microsoft', weightPct: '5' }]);
  });
});

describe('toStockMetadata (MKT-06, D-05)', () => {
  const summary = {
    assetProfile: { sector: 'Technology', country: 'United States' },
    price: { marketCap: 3400000000000 },
    summaryDetail: { trailingPE: 33.5, priceToSalesTrailing12Months: 8.9 },
    defaultKeyStatistics: { priceToBook: 48.2 },
    financialData: { operatingCashflow: 120000000000 },
  };
  const empty = { sector: null, country: null, marketCapMil: null, pe: null, pb: null, ps: null, pcf: null };

  it('returns the sector key, country, $mil market cap and P/x ratios', () => {
    expect(toStockMetadata(summary)).toEqual({
      sector: 'technology',
      country: 'United States',
      marketCapMil: '3400000',
      pe: '33.5',
      pb: '48.2',
      ps: '8.9',
      pcf: '28.3333',
    });
  });

  it('uses null for missing fields', () => {
    expect(toStockMetadata({})).toEqual(empty);
  });

  it('uses null for a null market cap instead of throwing', () => {
    expect(toStockMetadata({ price: { marketCap: null as unknown as number } })).toEqual(empty);
  });

  it('gives null for negative ratios, non-positive cash flow and an unknown sector', () => {
    const meta = toStockMetadata({
      ...summary,
      assetProfile: { sector: 'Conglomerates', country: 'United States' },
      summaryDetail: { trailingPE: -4, priceToSalesTrailing12Months: 0 },
      defaultKeyStatistics: {},
      financialData: { operatingCashflow: -5 },
    });
    expect(meta).toEqual({ ...empty, country: 'United States', marketCapMil: '3400000' });
  });
});

describe('toFundAggregates (D-03, D-04)', () => {
  const top = { stockPosition: 0.97, bondPosition: 0.01, cashPosition: 0.02 };
  const zeroSectors = Object.fromEntries(
    ['basicMaterials', 'consumerCyclical', 'financialServices', 'realEstate', 'communicationServices', 'energy', 'industrials', 'technology', 'consumerDefensive', 'healthcare', 'utilities'].map((k) => [k, '0']),
  );

  it('leaves the stock share in other for a non-US category', () => {
    const a = toFundAggregates(top, { categoryName: 'Foreign Large Blend' })!;
    expect(a.assetAllocation).toEqual({ cash: '2', usStock: '0', nonUsStock: '0', bond: '1', other: '97' });
    expect(a.equityPct).toBe('97');
  });

  it('counts the stock share as US for a US style category', () => {
    expect(toFundAggregates(top, { categoryName: 'Large Blend' })!.assetAllocation).toEqual({
      cash: '2',
      usStock: '97',
      nonUsStock: '0',
      bond: '1',
      other: '0',
    });
  });

  it('maps sectorWeightings to sector percents, and an empty list to null', () => {
    const a = toFundAggregates({ ...top, sectorWeightings: [{ technology: 0.31 }, { realestate: 0.02 }] }, undefined)!;
    expect(a.sectors).toEqual({ ...zeroSectors, technology: '31', realEstate: '2' });
    expect(toFundAggregates({ ...top, sectorWeightings: [] }, undefined)!.sectors).toBeNull();
  });

  it('inverts equityHoldings ratios at 2dp and keeps medianMarketCap in $mil', () => {
    const equityHoldings = { priceToEarnings: 0.04386, priceToBook: 0, priceToSales: -1, priceToCashflow: 0.05325, medianMarketCap: 542591.06 };
    expect(toFundAggregates({ ...top, equityHoldings }, undefined)!.valuation).toEqual({
      marketCapMil: '542591.06',
      pe: '22.8',
      pb: null,
      ps: null,
      pcf: '18.78',
    });
  });

  it('converts the expense ratio fraction to percent', () => {
    expect(toFundAggregates(top, { feesExpensesInvestment: { annualReportExpenseRatio: 0.0007 } })!.expenseRatioPct).toBe('0.07');
    expect(toFundAggregates(top, undefined)!.expenseRatioPct).toBeNull();
  });

  it('reads bondRatings only when bondPosition > 0 and skips the us_government subtotal', () => {
    const bondRatings = [{ aaa: 0.1 }, { aa: 0.7 }, { a: 0.1 }, { bbb: 0.05 }, { below_b: 0.03 }, { other: 0.02 }, { us_government: 0.49 }] as Record<string, number>[];
    expect(toFundAggregates({ ...top, bondRatings }, undefined)!.bond).toEqual({
      sectors: null,
      creditQuality: { aaa: '10', aa: '70', a: '10', bbb: '5', bb: '0', b: '0', belowB: '3', nr: '2' },
      effectiveDurationYears: null,
      effectiveMaturityYears: null,
    });
    expect(toFundAggregates({ ...top, bondPosition: 0, bondRatings: [{ other: 1 }] }, undefined)!.bond).toBeNull();
  });

  it('never fills regions or styleBox', () => {
    const a = toFundAggregates(top, { categoryName: 'Large Blend' })!;
    expect(a.regions).toBeNull();
    expect(a.styleBox).toBeNull();
  });

  it('is carried on toFundHoldings', () => {
    const fund = toFundHoldings('X', 'X Fund', { ...top, holdings: [{ symbol: 'MSFT', holdingPercent: 0.05 }] }, { categoryName: 'Large Blend' });
    expect(fund!.aggregates).toEqual(toFundAggregates(top, { categoryName: 'Large Blend' }));
  });
});

/** A cache row with an arbitrary payload fetched `ageMin` minutes ago. */
function payloadRow(ticker: string, payload: object, ageMin: number) {
  return [ticker, { payload, fetchedAt: new Date(Date.now() - ageMin * 60_000) }] as const;
}

const vea = {
  name: 'Vanguard FTSE Developed Markets ETF',
  source: 'yahoo-top10' as const,
  constituents: [{ ticker: 'TSM', name: 'Taiwan Semiconductor', weightPct: '3.12' }],
  aggregates: null,
};

describe('getHoldings (D-10)', () => {
  it('returns the curated fund and its curated aggregates without Yahoo or the cache', async () => {
    const vti = await getHoldings('VTI', 'Vanguard Total Stock Market ETF');
    expect(vti.source).toBe('curated');
    expect(vti.constituents.length).toBeGreaterThanOrEqual(50);
    expect(vti.aggregates).toEqual(curatedAggregates('VTI'));
    expect(readMock).not.toHaveBeenCalled();
    expect(holdingsMock).not.toHaveBeenCalled();
  });

  it('serves a fresh HOLDINGS cache row without calling Yahoo', async () => {
    readMock.mockResolvedValue(new Map([payloadRow('VEA', vea, 60)]));
    expect(await getHoldings('VEA', vea.name)).toEqual({ ...vea, provenance: LIVE_PROVENANCE });
    expect(readMock).toHaveBeenCalledWith(['VEA'], 'HOLDINGS');
    expect(holdingsMock).not.toHaveBeenCalled();
  });

  it('fetches Yahoo top 10 when nothing is cached and writes it once', async () => {
    holdingsMock.mockResolvedValue(vea);
    expect(await getHoldings('VEA', vea.name)).toEqual({ ...vea, provenance: LIVE_PROVENANCE });
    expect(holdingsMock).toHaveBeenCalledWith('VEA', vea.name);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith('VEA', 'HOLDINGS', vea);
  });

  it('returns the stale cache row when Yahoo fails', async () => {
    readMock.mockResolvedValue(new Map([payloadRow('VEA', vea, 3 * 24 * 60)]));
    holdingsMock.mockResolvedValue(null);
    expect(await getHoldings('VEA', vea.name)).toEqual({ ...vea, provenance: LIVE_PROVENANCE });
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('marks the fund unavailable when Yahoo fails and nothing is cached', async () => {
    holdingsMock.mockResolvedValue(null);
    expect(await getHoldings('VEA', vea.name)).toEqual({
      name: vea.name,
      source: 'yahoo-top10',
      constituents: [],
      unavailable: true,
      aggregates: null,
      provenance: LIVE_PROVENANCE,
    });
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('ignores a cached empty top 10 and marks the fund unavailable', async () => {
    readMock.mockResolvedValue(new Map([payloadRow('VEA', { ...vea, constituents: [] }, 60)]));
    holdingsMock.mockResolvedValue(null);
    expect((await getHoldings('VEA', vea.name)).unavailable).toBe(true);
    expect(holdingsMock).toHaveBeenCalledTimes(1);
  });

  it('carries the curated holdings source and date as provenance', async () => {
    const { holdingsSource, holdingsAsOf } = mockFunds.VTI;
    expect((await getHoldings('VTI', 'Vanguard Total Stock Market ETF')).provenance).toEqual({
      url: holdingsSource,
      asOf: holdingsAsOf.slice(0, 10),
      asOfOrigin: 'curated',
      curated: true,
    });
    expect((await getHoldings('BND', 'Vanguard Total Bond Market ETF')).provenance).toEqual({
      url: null,
      asOf: null,
      asOfOrigin: 'curated',
      curated: true,
    });
  });

  it('gives live Yahoo and unavailable funds the live provenance', async () => {
    expect(LIVE_PROVENANCE).toEqual({ url: null, asOf: null, asOfOrigin: null, curated: false });
    holdingsMock.mockResolvedValue(null);
    expect((await getHoldings('VEA', vea.name)).provenance).toEqual(LIVE_PROVENANCE);
  });

  it('uses no Yahoo and no cache in mock mode', async () => {
    process.env.MARKET_DATA_MODE = 'mock';
    expect((await getHoldings('VEA', vea.name)).unavailable).toBe(true);
    expect((await getHoldings('QQQ', 'Invesco QQQ Trust')).source).toBe('curated');
    expect(readMock).not.toHaveBeenCalled();
    expect(holdingsMock).not.toHaveBeenCalled();
  });
});

describe('getMetadata', () => {
  const meta = { sector: 'technology' as const, country: 'United States', marketCapMil: '3400000', pe: '33.5', pb: '48.2', ps: '8.9', pcf: '28.3333' };

  it('refetches when the cached row has the Phase 3 shape', async () => {
    const phase3 = { sector: 'Technology', country: 'United States', marketCapMil: '3400000' };
    readMock.mockResolvedValue(new Map([payloadRow('AAPL', phase3, 60)]));
    metadataMock.mockResolvedValue(meta);
    expect(await getMetadata('AAPL')).toEqual(meta);
    expect(metadataMock).toHaveBeenCalledWith('AAPL');
  });

  it('serves a fresh METADATA cache row without calling Yahoo', async () => {
    readMock.mockResolvedValue(new Map([payloadRow('AAPL', meta, 60)]));
    expect(await getMetadata('AAPL')).toEqual(meta);
    expect(readMock).toHaveBeenCalledWith(['AAPL'], 'METADATA');
    expect(metadataMock).not.toHaveBeenCalled();
  });

  it('fetches Yahoo and writes the result once', async () => {
    metadataMock.mockResolvedValue(meta);
    expect(await getMetadata('AAPL')).toEqual(meta);
    expect(writeMock).toHaveBeenCalledWith('AAPL', 'METADATA', meta);
  });

  it('falls back to the stale row, then null, without writing', async () => {
    metadataMock.mockResolvedValue(null);
    expect(await getMetadata('AAPL')).toBeNull();
    readMock.mockResolvedValue(new Map([payloadRow('AAPL', meta, 3 * 24 * 60)]));
    expect(await getMetadata('AAPL')).toEqual(meta);
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('returns null in mock mode', async () => {
    process.env.MARKET_DATA_MODE = 'mock';
    expect(await getMetadata('AAPL')).toBeNull();
    expect(readMock).not.toHaveBeenCalled();
  });
});
