import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Analysis } from '../src/lib/analysis';

const analysis: Analysis = {
  summary: { name: 'My Portfolio', benchmark: 'SPY', totalCents: '1000000', asOf: null, staleTickers: [], unpricedTickers: [] },
  holdings: [],
  intersection: {
    rows: [
      {
        ticker: 'AAPL',
        name: 'Apple Inc',
        portfolioPct: '10.0000',
        portfolioPctDisplay: '10.00',
        valueCents: '100000',
        children: [{ sourceTicker: 'AAPL', sourceName: 'Direct Holding', fundWeightPct: '100.00', portfolioPct: '10.0000', portfolioPctDisplay: '10.00', valueCents: '100000' }],
      },
    ],
    coverage: { lookThroughPct: '100.0000', otherPct: '0.0000', fundCoveredPct: null, fundOtherPct: null, items: [] },
  },
  prismView: {} as Analysis['prismView'],
};

vi.mock('../src/lib/load-analysis', () => ({ loadAnalysis: vi.fn(async () => analysis) }));

const { POST } = await import('../src/app/api/chat/route');

const BUSY = 'The assistant is busy, please try again in a minute.';

function ask(body: unknown): Request {
  return new Request('http://localhost:8420/api/chat', {
    method: 'POST',
    headers: { host: 'localhost:8420', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function completion(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.stubEnv('GROQ_API_KEY', 'test-groq');
    vi.stubEnv('OPENROUTER_API_KEY', 'test-or');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('answers a valid question with { reply }', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => completion('{"reply":"Top 10 is 10.00%"}')));
    const res = await POST(ask({ question: 'what is my top 10 stock concentration?' }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ reply: 'Top 10 is 10.00%' });
    expect(text).not.toContain('test-groq');
    expect(text).not.toContain('test-or');
  });

  it('returns 503 with the busy message when every provider fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => completion('', 429)));
    const res = await POST(ask({ question: 'what is my top 10 stock concentration?' }));
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: BUSY });
    expect(text).not.toContain('test-groq');
    expect(text).not.toContain('test-or');
  });

  it('returns 404 when neither key is set', async () => {
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(ask({ question: 'hi' }));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an empty or over-long question', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(ask({ question: '   ' }))).status).toBe(400);
    expect((await POST(ask({ question: 'x'.repeat(501) }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
