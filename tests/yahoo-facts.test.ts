import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Fake yahoo-finance2 client: no network. Each test queues what quote() does. */
const quote = vi.hoisted(() => vi.fn());
vi.mock('yahoo-finance2', () => ({
  default: class {
    quote = quote;
  },
}));

const { fetchYahooFacts, toStockFact, FACTS_BATCH } = await import('../src/lib/market/yahoo');
const { classifyUniverse, FIXED_THRESHOLDS } = await import('../src/lib/engine/prism-view/classify');

const q = (symbol: string, extra: Record<string, unknown>) => ({ symbol, quoteType: 'EQUITY', currency: 'USD', ...extra });

beforeEach(() => quote.mockReset());

describe('toStockFact', () => {
  it('converts market cap to $mil and keeps the percent dividend yield as is', () => {
    expect(toStockFact(q('ZZA', { marketCap: 5_093_820_203_008, trailingPE: 39.03, priceToBook: 45.4, dividendYield: 0.32 }))).toEqual({
      marketCapMil: 5093820.2,
      pe: 39.03,
      pb: 45.4,
      divYieldPct: 0.32,
    });
  });

  it('drops non-USD quotes and quotes without a positive market cap', () => {
    expect(toStockFact(q('ZZJ', { currency: 'JPY', marketCap: 38_869_793_767_424 }))).toBeNull();
    expect(toStockFact(q('ZZN', { currency: undefined, marketCap: 1e9 }))).toBeNull();
    expect(toStockFact(q('ZZM', {}))).toBeNull();
    expect(toStockFact(q('ZZ0', { marketCap: 0 }))).toBeNull();
  });

  it('keeps missing ratios as null', () => {
    expect(toStockFact(q('ZZR', { marketCap: 2e9 }))).toEqual({ marketCapMil: 2000, pe: null, pb: null, divYieldPct: null });
  });
});

describe('fetchYahooFacts', () => {
  it('keys by canonical ticker; a bogus P/B is kept raw and ignored by the classifier', async () => {
    quote.mockResolvedValueOnce([q('ZZ-B', { marketCap: 1.2e12, trailingPE: 16, priceToBook: 0.001, dividendYield: 0 })]);
    const { facts, failedBatches } = await fetchYahooFacts(['ZZ.B']);
    expect(quote).toHaveBeenCalledWith(['ZZ-B']);
    expect(facts['ZZ.B'].pb).toBe(0.001);
    expect(failedBatches).toBe(0);
    const cells = classifyUniverse({ 'ZZ.B': { marketCapMil: '1200000', pe: '16', pb: '0.001', divYieldPct: '0' } }, FIXED_THRESHOLDS);
    expect(cells.get('ZZ.B')).toEqual({ size: 'large', style: 'blend' });
  });

  it('uses the partial result attached to a validation error', async () => {
    const error = Object.assign(new Error('did not validate'), {
      name: 'FailedYahooValidationError',
      result: [q('ZZA', { marketCap: 3e9, trailingPE: 12 }), q('ZZX', { currency: 'KRW', marketCap: 9e12 })],
    });
    quote.mockRejectedValueOnce(error);
    const { facts, failedBatches } = await fetchYahooFacts(['ZZA', 'ZZX']);
    expect(Object.keys(facts)).toEqual(['ZZA']);
    expect(failedBatches).toBe(0);
  });

  it('counts a batch that fails outright', async () => {
    quote.mockRejectedValueOnce(new Error('network down'));
    expect(await fetchYahooFacts(['ZZA'])).toEqual({ facts: {}, failedBatches: 1 });
  });

  it(`splits the ticker list into batches of ${FACTS_BATCH}`, async () => {
    quote.mockResolvedValue([]);
    const tickers = Array.from({ length: 2 * FACTS_BATCH + 5 }, (_, i) => `ZZ${i}`);
    await fetchYahooFacts(tickers);
    expect(quote.mock.calls.map(([symbols]) => symbols.length)).toEqual([FACTS_BATCH, FACTS_BATCH, 5]);
  });
});
