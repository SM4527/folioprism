import { marketQuoteSchema, type MarketQuote } from './types';

/** Exchanges tried in order (D-03). */
const EXCHANGES = ['NASDAQ', 'NYSEARCA', 'NYSE', 'MUTF'] as const;

/** Google's instrument type code (entity index 3), observed live 2026-11-19: AAPL 0, FXAIX 2, QQQM and VTI 5. */
const QUOTE_TYPES: Record<number, string> = { 0: 'EQUITY', 2: 'MUTUALFUND', 5: 'ETF' };

/** Per-request limit, so one hung page costs at most this long per exchange. */
export const GOOGLE_TIMEOUT_MS = 5_000;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const BLOCK_RE = /AF_initDataCallback\(\{key: '[^']*', hash: '[^']*', data:([\s\S]*?), sideChannel: \{\}\}\);/g;

/**
 * The quote entity for TICKER:EXCHANGE anywhere in a data array.
 * Observed shape: [mid, [ticker, exchange], name, type, currency, [price, change, pct, ...], ..., [epochSeconds], ...].
 */
function findQuote(node: unknown, ticker: string, exchange: string): unknown[] | null {
  if (!Array.isArray(node)) return null;
  const [, symbol, , , , price] = node;
  if (Array.isArray(symbol) && symbol[0] === ticker && symbol[1] === exchange && Array.isArray(price) && typeof price[0] === 'number') {
    return node;
  }
  for (const child of node) {
    const found = findQuote(child, ticker, exchange);
    if (found) return found;
  }
  return null;
}

/** Google's own name, type, currency, price and market time for TICKER:EXCHANGE; JSON.parse of the data array only, no HTML attributes. */
export function parseGooglePrice(
  html: string,
  ticker: string,
  exchange: string,
): { name: string; quoteType: string; currency: string; price: string; asOf: string } | null {
  for (const [, data] of html.matchAll(BLOCK_RE)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }
    const quote = findQuote(parsed, ticker, exchange);
    if (!quote) continue;
    const time = (quote[11] as unknown[] | null)?.[0];
    const asOf = typeof time === 'number' ? new Date(time * 1000) : new Date();
    return {
      name: String(quote[2]),
      quoteType: QUOTE_TYPES[quote[3] as number] ?? 'UNKNOWN',
      currency: String(quote[4]),
      price: String((quote[5] as number[])[0]),
      asOf: asOf.toISOString(),
    };
  }
  return null;
}

/** A live Google quote for the ticker, typed by Google itself, 'not-found' when every exchange answered without one, else 'unreachable'. */
export async function fetchGoogleQuote(ticker: string): Promise<MarketQuote | 'not-found' | 'unreachable'> {
  let answered = false;
  for (const exchange of EXCHANGES) {
    const url = `https://www.google.com/finance/quote/${encodeURIComponent(ticker)}:${exchange}`;
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    }).catch(() => null);
    if (!res?.ok) continue;
    answered = true;
    const found = parseGooglePrice(await res.text(), ticker, exchange);
    if (!found) continue;
    const quote = marketQuoteSchema.safeParse({
      ...found,
      source: 'google',
      stale: false,
    });
    if (quote.success) return quote.data;
  }
  return answered ? 'not-found' : 'unreachable';
}
