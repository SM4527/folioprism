import { buildAnalysis, type Analysis } from '@/lib/analysis';
import { prisma } from '@/lib/db';
import { isCashLike } from '@/lib/engine/ticker';
import { readImports, withImport } from '@/lib/fund-imports';
import { PORTFOLIO_ID, toHoldingRow } from '@/lib/holdings';
import { getHoldings, getMetadata, getQuotes, type FundHoldings, type QuoteResult, type StockMetadata } from '@/lib/market';
import { curatedAggregates, curatedStock, isCurated } from '@/lib/market/mock';

/** FUND if curated or quoted as ETF / MUTUALFUND, else STOCK (D-11). */
function isFund(ticker: string, result: QuoteResult | undefined): boolean {
  const type = result?.status === 'ok' ? result.quote.quoteType : undefined;
  return isCurated(ticker) || type === 'ETF' || type === 'MUTUALFUND';
}

/** Fund holdings for every fund; an imported file replaces its constituents (D-11, DEC-06). */
async function resolveFunds(tickers: string[], quotes: Map<string, QuoteResult>): Promise<Record<string, FundHoldings>> {
  const funds = tickers.filter((t) => isFund(t, quotes.get(t)));
  const nameOf = (t: string) => {
    const r = quotes.get(t);
    return r?.status === 'ok' ? r.quote.name : t;
  };
  const [holdings, imports] = await Promise.all([Promise.all(funds.map((t) => getHoldings(t, nameOf(t)))), readImports(funds)]);
  const resolve = (t: string, h: FundHoldings) => (imports.has(t) ? withImport(h, imports.get(t)!) : h);
  return Object.fromEntries(funds.map((t, i) => [t, resolve(t, holdings[i])]));
}

/** Metadata for priced or curated direct stocks, read in the request so the Prism View can use it (D-05, pitfall 4). */
async function resolveMetadata(tickers: string[], quotes: Map<string, QuoteResult>): Promise<Record<string, StockMetadata | null>> {
  const known = (t: string) => quotes.get(t)?.status === 'ok' || curatedStock(t) !== undefined;
  const stocks = tickers.filter((t) => known(t) && !isFund(t, quotes.get(t)));
  const metadata = await Promise.all(stocks.map(getMetadata));
  return Object.fromEntries(stocks.map((t, i) => [t, metadata[i]]));
}

/** The full analysis of the default portfolio, shared by /api/analysis and /api/chat (D-14, D-16). */
export async function loadAnalysis(mergeShareClasses: boolean): Promise<Analysis> {
  const [portfolio, stored] = await Promise.all([
    prisma.portfolio.findUniqueOrThrow({ where: { id: PORTFOLIO_ID } }),
    prisma.portfolioHolding.findMany({ where: { portfolioId: PORTFOLIO_ID }, orderBy: { id: 'asc' } }),
  ]);
  const holdings = stored.map(toHoldingRow);
  const tickers = holdings.map((h) => h.ticker).filter((t) => !isCashLike(t));
  const quotes = await getQuotes(tickers);
  const [funds, metadata] = await Promise.all([resolveFunds(tickers, quotes), resolveMetadata(tickers, quotes)]);
  const market = { funds, metadata, benchmark: curatedAggregates(portfolio.benchmarkTicker) ?? null };
  return buildAnalysis(portfolio, holdings, quotes, market, mergeShareClasses);
}
