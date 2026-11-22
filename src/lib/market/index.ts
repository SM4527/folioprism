import type { z } from 'zod';
import { readCache, writeCache, type CacheRow, type CacheType } from './cache';
import { fetchGoogleQuote } from './google';
import { curatedAggregates, curatedFund, curatedStock, mockQuote } from './mock';
import {
  fundHoldingsSchema,
  LIVE_PROVENANCE,
  marketQuoteSchema,
  stockMetadataSchema,
  type FundHoldings,
  type MarketQuote,
  type QuoteResult,
  type StockMetadata,
} from './types';
import { fetchYahooHoldings, fetchYahooMetadata, fetchYahooQuotes } from './yahoo';

export type { FundHoldings, MarketQuote, QuoteResult, QuoteSource, StockMetadata } from './types';

/** Cache freshness per data type (D-02). */
export const TTL_MS = {
  QUOTE: 15 * 60_000,
  HOLDINGS: 24 * 3_600_000,
  METADATA: 24 * 3_600_000,
};

type CachedQuote = { quote: MarketQuote; fresh: boolean };

/** 'mock' skips the cache and the live providers (D-06); anything else is 'live'. */
export function marketMode(): 'live' | 'mock' {
  return process.env.MARKET_DATA_MODE === 'mock' ? 'mock' : 'live';
}

/** Valid cached quotes, each marked fresh when younger than the QUOTE TTL. Invalid payloads are dropped. */
function cachedQuotes(rows: Map<string, CacheRow>): Map<string, CachedQuote> {
  const out = new Map<string, CachedQuote>();
  for (const [ticker, row] of rows) {
    const parsed = marketQuoteSchema.safeParse(row.payload);
    if (!parsed.success) continue;
    const fresh = Date.now() - row.fetchedAt.getTime() < TTL_MS.QUOTE;
    out.set(ticker, {
      quote: { ...parsed.data, source: 'cache', stale: !fresh },
      fresh,
    });
  }
  return out;
}

/** Yahoo quotes for the given tickers, each priced one written to the cache; null when unreachable. */
async function liveQuotes(tickers: string[]): Promise<Map<string, MarketQuote | null> | null> {
  if (tickers.length === 0) return new Map();
  const live = await fetchYahooQuotes(tickers);
  if (live) await Promise.all([...live].map(([t, q]) => q && writeCache(t, 'QUOTE', q)));
  return live;
}

/** Google quotes for the given tickers, all at once; each hit is live and written to the cache (D-03). */
async function googleQuotes(tickers: string[]): Promise<Map<string, MarketQuote | 'not-found' | 'unreachable'>> {
  const results = await Promise.all(
    tickers.map(async (ticker) => {
      const result = await fetchGoogleQuote(ticker);
      if (typeof result === 'object') await writeCache(ticker, 'QUOTE', result);
      return [ticker, result] as const;
    }),
  );
  return new Map(results);
}

/** Live result per ticker: the Yahoo or Google quote, and whether a provider answered that the ticker does not exist (D-12). */
type Live = { quote?: MarketQuote; reached: boolean };

/** Resolve one ticker: live (Yahoo or Google), cache (fresh or stale), mock, then unknown or unreachable. */
function resolve(ticker: string, cached: Map<string, CachedQuote>, live: Live): QuoteResult {
  const quote = live.quote ?? cached.get(ticker)?.quote ?? mockQuote(ticker);
  if (quote) return { status: 'ok', quote };
  return live.reached ? { status: 'unknown' } : { status: 'unreachable' };
}

/** One QuoteResult per ticker: one cache read, one batched Yahoo call, then Google for the misses (D-02). */
export async function getQuotes(tickers: string[]): Promise<Map<string, QuoteResult>> {
  if (marketMode() === 'mock' || tickers.length === 0) {
    return new Map(tickers.map((t) => [t, resolve(t, new Map(), { reached: true })]));
  }
  const cached = cachedQuotes(await readCache(tickers, 'QUOTE'));
  const stale = tickers.filter((t) => !cached.get(t)?.fresh);
  const yahoo = await liveQuotes(stale);
  const google = await googleQuotes(stale.filter((t) => !yahoo?.get(t)));
  return new Map(
    tickers.map((t) => {
      const y = yahoo?.get(t);
      const g = google.get(t);
      const live = {
        quote: y ?? (typeof g === 'object' ? g : undefined),
        reached: y !== null && (yahoo !== null || (g !== undefined && g !== 'unreachable')),
      };
      return [t, resolve(t, cached, live)];
    }),
  );
}

/** QuoteResult for a single ticker. */
export async function getQuote(ticker: string): Promise<QuoteResult> {
  return (await getQuotes([ticker])).get(ticker)!;
}

/** Fresh cache, then live (written on success), then the stale cache row, then null (D-02). */
async function cachedOrLive<T extends object>(
  ticker: string,
  type: CacheType,
  schema: z.ZodType<T>,
  live: () => Promise<T | null>,
): Promise<T | null> {
  const row = (await readCache([ticker], type)).get(ticker);
  const parsed = row ? schema.safeParse(row.payload) : undefined;
  const cached = parsed?.success ? parsed.data : null;
  if (cached && Date.now() - row!.fetchedAt.getTime() < TTL_MS[type]) return cached;
  const result = await live();
  if (result) await writeCache(ticker, type, result);
  return result ?? cached;
}

/** One source per fund (MKT-05): curated constituents and aggregates, else Yahoo, else 100% OTHER via empty constituents (D-10). */
export async function getHoldings(ticker: string, name: string): Promise<FundHoldings> {
  const curated = curatedFund(ticker);
  if (curated) return { ...curated, aggregates: curatedAggregates(ticker) ?? null };
  const unavailable: FundHoldings = {
    name,
    source: 'yahoo-top10',
    constituents: [],
    unavailable: true,
    aggregates: null,
    provenance: LIVE_PROVENANCE,
  };
  if (marketMode() === 'mock') return unavailable;
  const found = await cachedOrLive<FundHoldings>(ticker, 'HOLDINGS', fundHoldingsSchema, () => fetchYahooHoldings(ticker, name));
  return found ? { ...found, provenance: LIVE_PROVENANCE } : unavailable;
}

/**
 * Sector, country, $mil market cap and P/x ratios for a direct stock: curated facts first in any mode,
 * else Yahoo; null when unknown or in mock mode, none invented (D-05, D-11).
 */
export async function getMetadata(ticker: string): Promise<StockMetadata | null> {
  const curated = curatedStock(ticker);
  if (curated) return curated;
  if (marketMode() === 'mock') return null;
  return cachedOrLive(ticker, 'METADATA', stockMetadataSchema, () => fetchYahooMetadata(ticker));
}
