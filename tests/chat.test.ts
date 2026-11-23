import Decimal from 'decimal.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAnalysis } from '../src/lib/analysis';
import { AssistantBusyError, BUSY_MESSAGE, askAssistant, chatEnabled } from '../src/lib/chat/llm';
import { CHAT_TOP_STOCKS, chatMessages, chatSnapshot } from '../src/lib/chat/snapshot';
import type { HoldingRow } from '../src/lib/holdings';
import { curatedAggregates, curatedFund, curatedStock, mockQuote } from '../src/lib/market/mock';
import type { FundHoldings, QuoteResult } from '../src/lib/market/types';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function ok(price: string, quoteType: string): QuoteResult {
  return {
    status: 'ok',
    quote: { price, currency: 'USD', name: 'n', quoteType, asOf: '2026-11-18T21:00:00.000Z', source: 'yahoo', stale: false },
  };
}

const constituents = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'AVGO', 'TSLA', 'BRK.B', 'JPM', 'LLY', 'V'];
const vti: FundHoldings = {
  name: 'Vanguard Total Stock Market ETF',
  source: 'curated',
  constituents: constituents.map((ticker, i) => ({ ticker, name: `${ticker} Inc`, weightPct: String(12 - i) })),
  aggregates: null,
};

const holdings: HoldingRow[] = [
  { id: 1, ticker: 'VTI', inputMode: 'DOLLARS', dollarAmount: '40000.00' },
  { id: 2, ticker: 'AAPL', inputMode: 'SHARES', shares: '25' },
  { id: 3, ticker: 'ZZZZZQ', inputMode: 'SHARES', shares: '10' },
];

const quotes = new Map<string, QuoteResult>([
  ['VTI', ok('359.48', 'ETF')],
  ['AAPL', ok('200.00', 'EQUITY')],
  ['ZZZZZQ', { status: 'unknown' }],
]);

const analysis = buildAnalysis(
  { name: 'My Portfolio', benchmarkTicker: 'SPY' },
  holdings,
  quotes,
  { funds: { VTI: vti }, metadata: {}, benchmark: null },
  false,
);

/** A chat completion response whose message content is `content`. */
function completion(content: string, status = 200, usage?: { prompt_tokens: number }): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status });
}

/** The prisma/seed.ts portfolio built offline from curated data and mock quotes. */
function seededAnalysis() {
  const seeded: HoldingRow[] = [
    { id: 1, ticker: 'VTI', inputMode: 'DOLLARS', dollarAmount: '40000.00' },
    { id: 2, ticker: 'FXAIX', inputMode: 'DOLLARS', dollarAmount: '30000.00' },
    { id: 3, ticker: 'QQQ', inputMode: 'SHARES', shares: '50' },
    { id: 4, ticker: 'SCHD', inputMode: 'DOLLARS', dollarAmount: '10000.00' },
    { id: 5, ticker: 'BND', inputMode: 'DOLLARS', dollarAmount: '15000.00' },
    { id: 6, ticker: 'AAPL', inputMode: 'SHARES', shares: '25' },
    { id: 7, ticker: 'MSFT', inputMode: 'SHARES', shares: '15' },
  ];
  const seededQuotes = new Map<string, QuoteResult>(seeded.map((h) => [h.ticker, { status: 'ok', quote: mockQuote(h.ticker)! }]));
  const funds = Object.fromEntries(
    ['VTI', 'FXAIX', 'QQQ', 'SCHD', 'BND'].map((t) => [t, { ...curatedFund(t)!, aggregates: curatedAggregates(t) ?? null }]),
  );
  const metadata = { AAPL: curatedStock('AAPL') ?? null, MSFT: curatedStock('MSFT') ?? null };
  return buildAnalysis(
    { name: 'My Portfolio', benchmarkTicker: 'SPY' },
    seeded,
    seededQuotes,
    { funds, metadata, benchmark: curatedAggregates('SPY') ?? null },
    false,
  );
}

const messages = chatMessages('what is my top 10 stock concentration?', chatSnapshot(analysis));

describe('chatSnapshot', () => {
  const snap = chatSnapshot(analysis);

  it('carries the summary with dollars, top10Pct and every holding', () => {
    expect(snap.summary).toMatchObject({ name: 'My Portfolio', benchmark: 'SPY', totalUsd: '45000.00', asOf: analysis.summary.asOf });
    expect(snap.summary.holdings).toEqual([
      { ticker: 'VTI', name: analysis.holdings[0].name, usd: '40000.00' },
      { ticker: 'AAPL', name: analysis.holdings[1].name, usd: '5000.00' },
      { ticker: 'ZZZZZQ', name: analysis.holdings[2].name, usd: null },
    ]);
  });

  it('sums top10Pct from exactly the first 10 rows', () => {
    const rows = analysis.intersection.rows;
    expect(rows.length).toBeGreaterThan(10);
    const expected = Decimal.sum(...rows.slice(0, 10).map((r) => r.portfolioPctDisplay)).toFixed(2);
    expect(snap.summary.top10Pct).toBe(expected);
  });

  it('keeps the top rows in order with their sources', () => {
    const rows = analysis.intersection.rows;
    expect(snap.topStocks[0]).toEqual({
      ticker: rows[0].ticker,
      name: rows[0].name,
      pct: rows[0].portfolioPctDisplay,
      usd: new Decimal(rows[0].valueCents).div(100).toFixed(2),
      sources: rows[0].children.map((c) => ({ ticker: c.sourceTicker, usd: new Decimal(c.valueCents).div(100).toFixed(2) })),
    });
    expect(snap.topStocks.map((r) => r.ticker)).toEqual(rows.slice(0, CHAT_TOP_STOCKS).map((r) => r.ticker));
  });

  it('caps a large portfolio at CHAT_TOP_STOCKS rows', () => {
    const seeded = seededAnalysis();
    expect(seeded.intersection.rows.length).toBeGreaterThan(CHAT_TOP_STOCKS);
    expect(chatSnapshot(seeded).topStocks).toHaveLength(CHAT_TOP_STOCKS);
  });

  it('gives every seeded source exact dollars that sum to its row', () => {
    for (const r of chatSnapshot(seededAnalysis()).topStocks) {
      expect(Decimal.sum(0, ...r.sources.map((s) => s.usd)).toFixed(2)).toBe(r.usd);
    }
  });

  it('passes the prismView through and keeps compact coverage', () => {
    expect(snap.prismView).toEqual(analysis.prismView);
    const c = analysis.intersection.coverage;
    expect(snap.coverage).toEqual({
      lookThroughPct: c.lookThroughPct,
      fundCoveredPct: c.fundCoveredPct,
      items: c.items.map((i) => ({ ticker: i.ticker, coveredPct: i.coveredPct, source: i.source, holdingsAsOf: i.holdingsAsOf })),
      staleHoldings: [],
    });
  });

  it('carries stale and unpriced tickers from the summary', () => {
    expect(snap.summary.staleTickers).toEqual(analysis.summary.staleTickers);
    expect(snap.summary.unpricedTickers).toEqual(analysis.summary.unpricedTickers);
    expect(snap.summary.unpricedTickers).toContain('ZZZZZQ');
  });

  it('lists funds with holdings older than 180 days as staleHoldings', () => {
    const c = analysis.intersection.coverage;
    const items = c.items.map((i, n) => (n === 0 ? { ...i, holdingsAsOf: '2020-01-01' } : i));
    const old = { ...analysis, intersection: { ...analysis.intersection, coverage: { ...c, items } } };
    expect(chatSnapshot(old).coverage.staleHoldings).toEqual([items[0].ticker]);
  });

  it('sends an upload date as a null holdings date but still flags it stale', () => {
    const c = analysis.intersection.coverage;
    const items = c.items.map((i, n) => (n === 0 ? { ...i, holdingsAsOf: '2020-01-01', asOfOrigin: 'upload' as const } : i));
    const up = chatSnapshot({ ...analysis, intersection: { ...analysis.intersection, coverage: { ...c, items } } });
    expect(up.coverage.items[0].holdingsAsOf).toBeNull();
    expect(up.coverage.staleHoldings).toEqual([items[0].ticker]);
  });

  it('tells the model what a null holdings date means', () => {
    const [system] = chatMessages('q', chatSnapshot(analysis));
    expect(system.content).toMatch(/holdingsAsOf is null for direct stocks/);
  });

  it('sums fewer than 10 rows when that is all there is', () => {
    const small = { ...analysis, intersection: { ...analysis.intersection, rows: analysis.intersection.rows.slice(0, 3) } };
    const expected = Decimal.sum(...small.intersection.rows.map((r) => r.portfolioPctDisplay)).toFixed(2);
    expect(chatSnapshot(small).summary.top10Pct).toBe(expected);
  });
});

describe('seeded prompt size', () => {
  it('keeps the seeded prompt at most 16000 chars (about 6k Groq tokens)', () => {
    const snap = chatSnapshot(seededAnalysis());
    const n = chatMessages('is any of my data stale or missing?', snap).reduce((sum, m) => sum + m.content.length, 0);
    console.info('seeded prompt chars', n);
    expect(n).toBeLessThanOrEqual(16000);
  });
});

describe('chatMessages', () => {
  it('returns a grounding system message and a user message with the snapshot and question', () => {
    const snap = chatSnapshot(analysis);
    const [system, user] = chatMessages('what is my top 10 stock concentration?', snap);
    expect(system.role).toBe('system');
    expect(system.content).toMatch(/only/i);
    expect(system.content).toMatch(/data/i);
    expect(system.content).toMatch(/never.*instructions/i);
    expect(system.content).toMatch(/markdown tables/i);
    expect(system.content).toContain('staleTickers');
    expect(system.content).toContain('unpricedTickers');
    expect(system.content).toContain('holdingsAsOf');
    expect(user.role).toBe('user');
    expect(user.content).toContain(JSON.stringify(snap));
    expect(user.content).toContain('what is my top 10 stock concentration?');
  });
});

describe('askAssistant', () => {
  beforeEach(() => {
    vi.stubEnv('GROQ_API_KEY', 'test-groq');
    vi.stubEnv('OPENROUTER_API_KEY', 'test-or');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('answers from Groq openai/gpt-oss-120b', async () => {
    const fetchMock = vi.fn(async () => completion('{"reply":"Top 10 is 31.2%"}', 200, { prompt_tokens: 1234 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await askAssistant(messages)).toBe('Top 10 is 31.2%');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GROQ_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-groq');
    expect(JSON.parse(init.body as string).model).toBe('openai/gpt-oss-120b');
    expect(console.info).toHaveBeenCalledWith('chat answered', 'groq', 'prompt_tokens', 1234);
  });

  it('falls back to OpenRouter nvidia/nemotron-3.5-super-vl:free on 429', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === GROQ_URL ? completion('', 429) : completion('{"reply":"From OpenRouter"}'),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await askAssistant(messages)).toBe('From OpenRouter');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe(OPENROUTER_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-or');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('nvidia/nemotron-3.5-super-vl:free');
    expect(body.provider).toEqual({ require_parameters: true });
  });

  it('falls back when the Groq fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === GROQ_URL) throw new TypeError('fetch failed');
      return completion('{"reply":"From OpenRouter"}');
    }));
    expect(await askAssistant(messages)).toBe('From OpenRouter');
  });

  it('falls back when Groq returns invalid JSON content', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === GROQ_URL ? completion('not json') : completion('{"reply":"From OpenRouter"}'),
    ));
    expect(await askAssistant(messages)).toBe('From OpenRouter');
  });

  it('throws AssistantBusyError when every provider fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === GROQ_URL ? completion('', 429) : completion('', 500))));
    const error = await askAssistant(messages).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AssistantBusyError);
    expect((error as Error).message).toBe(BUSY_MESSAGE);
  });

  it('skips Groq when only OPENROUTER_API_KEY is set', async () => {
    vi.stubEnv('GROQ_API_KEY', '');
    const fetchMock = vi.fn(async () => completion('{"reply":"From OpenRouter"}'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await askAssistant(messages)).toBe('From OpenRouter');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(OPENROUTER_URL);
  });

  it('is busy after one Groq 429 when only GROQ_API_KEY is set', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const fetchMock = vi.fn(async () => completion('', 429));
    vi.stubGlobal('fetch', fetchMock);
    await expect(askAssistant(messages)).rejects.toBeInstanceOf(AssistantBusyError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never puts a key in a request body', async () => {
    const fetchMock = vi.fn(async (url: string) => (url === GROQ_URL ? completion('', 429) : completion('{"reply":"ok"}')));
    vi.stubGlobal('fetch', fetchMock);
    await askAssistant(messages);
    for (const call of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(call[1].body).not.toContain('test-groq');
      expect(call[1].body).not.toContain('test-or');
    }
  });
});

describe('chatEnabled', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is false with both keys empty and true with either set', () => {
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    expect(chatEnabled()).toBe(false);
    vi.stubEnv('GROQ_API_KEY', 'test-groq');
    expect(chatEnabled()).toBe(true);
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', 'test-or');
    expect(chatEnabled()).toBe(true);
  });
});
