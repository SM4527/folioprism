import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { figiIds, keptSnapshotBlocks, tickerLookup, toConstituents } from '../src/lib/refresh/constituents';
import { mapToTickers, type FigiJob } from '../src/lib/refresh/figi';
import type { NportHolding } from '../src/lib/refresh/nport';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const noSleep = async () => {};

function fakePost(responses: Response[]) {
  const calls: FigiJob[][] = [];
  const post = vi.fn(async (jobs: FigiJob[]) => {
    calls.push(jobs);
    return responses.shift() ?? json(jobs.map(() => ({ warning: 'No identifier found.' })));
  });
  return { post, calls };
}

describe('mapToTickers', () => {
  beforeEach(() => vi.stubEnv('OPENFIGI_API_KEY', ''));
  afterEach(() => vi.unstubAllEnvs());

  it('answers cached ids without a request', async () => {
    const { post } = fakePost([]);
    const out = await mapToTickers([{ key: 'C1', idType: 'ID_CUSIP' }], { C1: 'AAPL' }, post, noSleep);
    expect(out).toEqual({ C1: 'AAPL' });
    expect(post).not.toHaveBeenCalled();
  });

  it('asks only uncached ids, in batches of 10, and caches the answers', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => ({ key: `C${i}`, idType: 'ID_CUSIP' as const }));
    const cache: Record<string, string | null> = { C0: 'AAA' };
    const { post, calls } = fakePost([
      json(Array.from({ length: 10 }, (_, i) => ({ data: [{ ticker: `T${i + 1}` }] }))),
      json([{ data: [{ ticker: 'BRK/B' }] }]),
    ]);
    const out = await mapToTickers(ids, cache, post, noSleep);
    expect(calls.map((c) => c.length)).toEqual([10, 1]);
    expect(calls[0][0]).toEqual({ idType: 'ID_CUSIP', idValue: 'C1', exchCode: 'US' });
    expect(out.C11).toBe('BRK.B');
    expect(cache.C1).toBe('T1');
    expect(out.C0).toBe('AAA');
  });

  it('caches a warning or an invalid ticker as null', async () => {
    const cache: Record<string, string | null> = {};
    const { post } = fakePost([json([{ warning: 'No identifier found.' }, { data: [{ ticker: 'BAD TICKER!' }] }])]);
    const out = await mapToTickers([{ key: 'I1', idType: 'ID_ISIN' }, { key: 'I2', idType: 'ID_ISIN' }], cache, post, noSleep);
    expect(out).toEqual({ I1: null, I2: null });
    expect(cache).toEqual({ I1: null, I2: null });
  });

  it('waits and retries the same batch after a 429', async () => {
    const sleep = vi.fn(noSleep);
    const { post, calls } = fakePost([json({}, 429), json([{ data: [{ ticker: 'MSFT' }] }])]);
    const out = await mapToTickers([{ key: 'C1', idType: 'ID_CUSIP' }], {}, post, sleep);
    expect(out.C1).toBe('MSFT');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    expect(sleep).toHaveBeenCalled();
  });
});

const h = (over: Partial<NportHolding>): NportHolding => ({
  name: 'X', cusip: null, isin: null, ticker: null, pctVal: '1', assetCat: 'EC', ...over,
});

describe('figiIds and tickerLookup', () => {
  const holdings = [
    h({ cusip: '037833100', isin: 'US0378331005' }),
    h({ isin: 'US559CVR0225' }),
    h({ ticker: 'ESU6', cusip: '111111111' }),
    h({ cusip: '222222222', assetCat: 'STIV' }),
    h({ cusip: '333333333', pctVal: '-0.1' }),
  ];

  it('asks FIGI only for positive EC rows without their own ticker', () => {
    expect(figiIds(holdings, {})).toEqual([
      { key: '037833100', idType: 'ID_CUSIP' },
      { key: 'US559CVR0225', idType: 'ID_ISIN' },
    ]);
  });

  it('asks the ISIN only after the CUSIP found no US ticker', () => {
    const linde = [h({ cusip: 'G54950103', isin: 'IE000S9YS762' })];
    expect(figiIds(linde, { G54950103: null })).toEqual([{ key: 'IE000S9YS762', idType: 'ID_ISIN' }]);
    expect(figiIds(linde, { G54950103: 'LIN' })).toEqual([{ key: 'G54950103', idType: 'ID_CUSIP' }]);
    expect(tickerLookup({ G54950103: null, IE000S9YS762: 'LIN' })(linde[0])).toBe('LIN');
  });

  it('prefers the filing ticker, then the mapped id', () => {
    const tickerOf = tickerLookup({ '037833100': 'AAPL', US559CVR0225: null, '111111111': 'NOPE' });
    expect(holdings.slice(0, 3).map(tickerOf)).toEqual(['AAPL', null, 'ESU6']);
  });
});

describe('toConstituents', () => {
  const tickers: Record<string, string | null> = { a: 'AAPL', b: 'GOOGL', c: 'GOOGL', d: null, e: 'ZERO', f: 'MSFT', g: 'BOND', n: 'NVDA' };
  const tickerOf = (x: NportHolding) => tickers[x.cusip ?? ''] ?? null;
  const { constituents, sumPct, unmappedPct } = toConstituents([
    h({ cusip: 'a', name: 'APPLE INC', pctVal: '5.871626660176' }),
    h({ cusip: 'b', name: 'Alphabet A', pctVal: '1.00005' }),
    h({ cusip: 'c', name: 'Alphabet A2', pctVal: '1.00005' }),
    h({ cusip: 'd', name: 'Unmapped', pctVal: '0.25' }),
    h({ cusip: 'e', name: 'Tiny', pctVal: '0.00004' }),
    h({ cusip: 'f', name: 'Microsoft', pctVal: '2.00015' }),
    h({ cusip: 'n', name: 'Nvidia', pctVal: '2.00025' }),
    h({ cusip: 'g', name: 'Bond', pctVal: '3', assetCat: 'DBT' }),
    h({ cusip: 'a', name: 'Apple short', pctVal: '-1' }),
  ], tickerOf, { AAPL: 'Apple Inc' });

  it('keeps mapped positive EC rows, sums duplicates and rounds half-even to 4dp', () => {
    expect(constituents).toEqual([
      { ticker: 'AAPL', name: 'Apple Inc', weightPct: 5.8716 },
      { ticker: 'GOOGL', name: 'Alphabet A', weightPct: 2.0001 },
      { ticker: 'NVDA', name: 'Nvidia', weightPct: 2.0002 },
      { ticker: 'MSFT', name: 'Microsoft', weightPct: 2.0002 },
    ].sort((x, y) => y.weightPct - x.weightPct || x.ticker.localeCompare(y.ticker)));
  });

  it('sorts by weight then ticker, and drops zero results', () => {
    expect(constituents.map((c) => c.ticker)).toEqual(['AAPL', 'MSFT', 'NVDA', 'GOOGL']);
  });

  it('reports the written sum and the unmapped weight', () => {
    expect(sumPct).toBe('11.8721');
    expect(unmappedPct).toBe('0.2500');
  });
});

describe('keptSnapshotBlocks', () => {
  const sec = 'https://www.sec.gov/Archives/edgar/data/36405/000003640526000480/primary_doc.xml';
  const yahoo = 'https://query2.finance.yahoo.com/v10/finance/quoteSummary';

  it('blocks an older list against a kept full-list snapshot', () => {
    expect(keptSnapshotBlocks({ holdingsSource: sec, holdingsAsOf: '2026-08-31T00:00:00Z' }, '2026-06-30')).toBe(true);
  });

  it('does not block an equal or newer date', () => {
    expect(keptSnapshotBlocks({ holdingsSource: sec, holdingsAsOf: '2026-08-31T00:00:00Z' }, '2026-08-31')).toBe(false);
    expect(keptSnapshotBlocks({ holdingsSource: sec, holdingsAsOf: '2026-08-31T00:00:00Z' }, '2026-09-30')).toBe(false);
  });

  it('never blocks against a Yahoo stub or a kept entry without a source', () => {
    expect(keptSnapshotBlocks({ holdingsSource: yahoo, holdingsAsOf: '2026-11-20T00:00:00Z' }, '2026-09-30')).toBe(false);
    expect(keptSnapshotBlocks({ holdingsAsOf: '2026-11-20T00:00:00Z' }, '2026-09-30')).toBe(false);
  });
});
