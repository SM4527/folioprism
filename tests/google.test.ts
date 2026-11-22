import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGoogleQuote, GOOGLE_TIMEOUT_MS, parseGooglePrice } from '../src/lib/market/google';

const html = readFileSync('tests/fixtures/google-quote.html', 'utf8');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseGooglePrice', () => {
  it('reads the AAPL name, type, currency, price and market time from the AF_initDataCallback quote', () => {
    expect(parseGooglePrice(html, 'AAPL', 'NASDAQ')).toEqual({
      name: 'Apple Inc',
      quoteType: 'EQUITY',
      currency: 'USD',
      price: '352.45',
      asOf: '2026-11-19T13:51:21.000Z',
    });
  });

  it('picks the quote for the requested symbol, not a related one', () => {
    expect(parseGooglePrice(html, 'NVDA', 'NASDAQ')?.price).toBe('150.96');
  });

  it('returns null when the page has no quote for the symbol', () => {
    expect(parseGooglePrice('<html>no data</html>', 'AAPL', 'NASDAQ')).toBeNull();
    expect(parseGooglePrice(html, 'AAPL', 'NYSE')).toBeNull();
  });
});

describe('fetchGoogleQuote', () => {
  it('tries exchanges in order and returns the first price as a live google quote', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      new Response(url.endsWith('AAPL:NASDAQ') ? html : '<html></html>'),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchGoogleQuote('AAPL')).toEqual({
      price: '352.45',
      asOf: '2026-11-19T13:51:21.000Z',
      name: 'Apple Inc',
      currency: 'USD',
      quoteType: 'EQUITY',
      source: 'google',
      stale: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://www.google.com/finance/quote/AAPL:NASDAQ');
  });

  it('returns not-found when every exchange answers without a price', async () => {
    const fetchMock = vi.fn(async () => new Response('<html></html>'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchGoogleQuote('ZZZZZQ')).toBe('not-found');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('reads the instrument type and name from the page, so a NASDAQ ETF is an ETF', async () => {
    const entity =
      '["/g/11qlx75gs1",["QQQM","NASDAQ"],"Invesco NASDAQ 100 ETF",5,"USD",[271.58,0,0,2,2,2],null,271.58,"#040e61","US","/g/11ql_1h590",[1795097934]]';
    const etf = `<script>AF_initDataCallback({key: 'ds:2', hash: '11', data:[[[${entity}]]], sideChannel: {}});</script>`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(etf)));
    const quote = await fetchGoogleQuote('QQQM');
    expect(quote).toMatchObject({ quoteType: 'ETF', name: 'Invesco NASDAQ 100 ETF', currency: 'USD' });
  });

  it('gives up on a request that does not answer in time', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => AbortSignal.abort());
    const hang = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        if (init?.signal?.aborted) reject(init.signal.reason);
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      });
    vi.stubGlobal('fetch', vi.fn(hang));
    expect(await fetchGoogleQuote('AAPL')).toBe('unreachable');
    expect(timeout).toHaveBeenCalledWith(GOOGLE_TIMEOUT_MS);
    timeout.mockRestore();
  });

  it('returns unreachable when every request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(await fetchGoogleQuote('AAPL')).toBe('unreachable');
  });
});
