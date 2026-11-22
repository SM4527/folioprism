import { prisma } from '../db';

export type CacheType = 'QUOTE' | 'HOLDINGS' | 'METADATA';
export type CacheRow = { payload: unknown; fetchedAt: Date };

/** Cached payloads for the given tickers, keyed by ticker (MKT-02). */
export async function readCache(tickers: string[], dataType: CacheType): Promise<Map<string, CacheRow>> {
  const rows = await prisma.marketDataCache.findMany({ where: { dataType, ticker: { in: tickers } } });
  return new Map(rows.map((r) => [r.ticker, { payload: r.payloadJson, fetchedAt: r.fetchedAt }]));
}

/** Store a live provider payload with fetchedAt = now (D-02: never call with fallbacks). */
export async function writeCache(ticker: string, dataType: CacheType, payload: object): Promise<void> {
  await prisma.marketDataCache.upsert({
    where: { ticker_dataType: { ticker, dataType } },
    create: { ticker, dataType, payloadJson: payload, fetchedAt: new Date() },
    update: { payloadJson: payload, fetchedAt: new Date() },
  });
}
