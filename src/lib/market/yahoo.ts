import Decimal from 'decimal.js';
import YahooFinance from 'yahoo-finance2';
import { CREDIT, SECTOR_BY_NAME, SECTORS, YAHOO_SECTOR_KEYS, type CreditKey, type SectorKey } from '../engine/taxonomy';
import { canonicalTicker } from '../engine/ticker';
import type { FundAggregates } from '../engine/prism-view/types';
import {
  fundAggregatesSchema,
  fundHoldingsSchema,
  marketQuoteSchema,
  stockMetadataSchema,
  type FundHoldings,
  type MarketQuote,
  type StockMetadata,
} from './types';

const globalForYahoo = globalThis as unknown as {
  yahoo?: InstanceType<typeof YahooFinance>;
};

/** One Yahoo client per process with the built-in request queue (D-01). */
const yahoo =
  globalForYahoo.yahoo ??
  new YahooFinance({
    suppressNotices: ['yahooSurvey'],
    queue: { concurrency: 2, interval: 250 },
  });

if (process.env.NODE_ENV !== 'production') globalForYahoo.yahoo = yahoo;

/** The subset of a Yahoo quote the app reads. */
export interface RawYahooQuote {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketTime?: Date;
  currency?: string;
  longName?: string;
  shortName?: string;
  quoteType: string;
}

/** Yahoo's symbol for a canonical ticker: a one-letter share class takes a dash (BRK.B -> BRK-B), exchange suffixes stay (SHOP.TO). */
export function yahooSymbol(ticker: string): string {
  return ticker.replace(/^([A-Z0-9]+)\.([A-Z])$/, '$1-$2');
}

/** Map one Yahoo quote to a canonical ticker and validated quote; null when it has no usable price. */
export function toMarketQuote(raw: RawYahooQuote): { ticker: string; quote: MarketQuote } | null {
  if (typeof raw.regularMarketPrice !== 'number' || !(raw.regularMarketTime instanceof Date)) return null;
  const parsed = marketQuoteSchema.safeParse({
    price: String(raw.regularMarketPrice),
    currency: raw.currency ?? 'USD',
    name: raw.longName ?? raw.shortName ?? raw.symbol,
    quoteType: raw.quoteType,
    asOf: raw.regularMarketTime.toISOString(),
    source: 'yahoo',
    stale: false,
  });
  return parsed.success ? { ticker: canonicalTicker(raw.symbol), quote: parsed.data } : null;
}

/** Call Yahoo once for all tickers; null means unreachable, absent keys mean not found (D-07). */
async function quoteBatch(symbols: string[]): Promise<RawYahooQuote[] | null> {
  try {
    return (await yahoo.quote(symbols)) as RawYahooQuote[];
  } catch (error) {
    if (error instanceof Error && error.name === 'FailedYahooValidationError') {
      return (error as Error & { result: RawYahooQuote[] }).result;
    }
    return null;
  }
}

/** Batched live quotes keyed by canonical ticker (null: Yahoo knows the symbol but has no usable price), or null when Yahoo is unreachable. */
export async function fetchYahooQuotes(tickers: string[]): Promise<Map<string, MarketQuote | null> | null> {
  const raw = await quoteBatch(tickers.map(yahooSymbol));
  if (!raw) return null;
  return new Map(raw.map((r) => [canonicalTicker(r.symbol), toMarketQuote(r)?.quote ?? null]));
}

/** The subset of Yahoo `topHoldings` the app reads; holdingPercent is a fraction (0.07 = 7%). */
export interface RawTopHoldings {
  holdings?: {
    symbol?: string;
    holdingName?: string;
    holdingPercent?: number;
  }[];
  /** Positions are fractions of the fund (0.97 = 97%). */
  stockPosition?: number;
  bondPosition?: number;
  cashPosition?: number;
  /** One-key fractions keyed by YAHOO_SECTOR_KEYS, e.g. { technology: 0.31 }. */
  sectorWeightings?: Record<string, number>[];
  /** Ratios are reciprocals (earnings / price); medianMarketCap is in $mil. */
  equityHoldings?: {
    priceToEarnings?: number;
    priceToBook?: number;
    priceToSales?: number;
    priceToCashflow?: number;
    medianMarketCap?: number;
  };
  /** One-key fractions: aaa, aa, a, bbb, bb, b, below_b, other and the us_government subtotal. */
  bondRatings?: Record<string, number>[];
}

/** The subset of Yahoo `fundProfile` the app reads; the expense ratio is a fraction (0.0003 = 0.03%). */
export interface RawFundProfile {
  categoryName?: string | null;
  feesExpensesInvestment?: { annualReportExpenseRatio?: number };
}

/** The subset of Yahoo stock modules the app reads; marketCap and operatingCashflow are in dollars, ratios as-is. */
export interface RawStockSummary {
  assetProfile?: { sector?: string; country?: string };
  price?: { marketCap?: number };
  summaryDetail?: { trailingPE?: number; priceToSalesTrailing12Months?: number };
  defaultKeyStatistics?: { priceToBook?: number };
  financialData?: { operatingCashflow?: number };
}

/** The nine US equity style-box categories (large/mid/small x value/blend/growth); only these count a fund's stock share as US (D-04). */
const US_EQUITY_CATEGORIES = new Set([
  'Large Value',
  'Large Blend',
  'Large Growth',
  'Mid-Cap Value',
  'Mid-Cap Blend',
  'Mid-Cap Growth',
  'Small Value',
  'Small Blend',
  'Small Growth',
]);

/** Yahoo bondRatings keys per credit key. */
const YAHOO_CREDIT_KEYS: Record<CreditKey, string> = {
  aaa: 'aaa',
  aa: 'aa',
  a: 'a',
  bbb: 'bbb',
  bb: 'bb',
  b: 'b',
  belowB: 'below_b',
  nr: 'other',
};

const YAHOO_KEY_BY_SECTOR = Object.fromEntries(Object.entries(YAHOO_SECTOR_KEYS).map(([y, k]) => [k, y])) as Record<SectorKey, string>;

/** A Yahoo fraction as a 0-100 percent at 4dp (drops float32 noise), clamped to [0, 100]; a non-number counts as 0. */
function pctOf(x: unknown): Decimal {
  return typeof x === 'number' ? Decimal.min(100, Decimal.max(0, new Decimal(x).times(100).toDecimalPlaces(4))) : new Decimal(0);
}

/** A positive number as a decimal string at `dp` places, else null. */
function positive(x: unknown, dp: number): string | null {
  return typeof x === 'number' && x > 0 ? new Decimal(x).toDecimalPlaces(dp).toString() : null;
}

/** 1 / x at 2dp for a positive reciprocal ratio, else null (D-03). */
function inverse(x: unknown): string | null {
  return typeof x === 'number' && x > 0 ? new Decimal(1).div(x).toDecimalPlaces(2).toString() : null;
}

/** One-key objects as percents per key, or null for an empty list. */
function percentMap<K extends string>(list: Record<string, number>[] | undefined, keys: readonly K[], yahooKey: Record<K, string>) {
  if (!list?.length) return null;
  const merged: Record<string, number> = Object.assign({}, ...list);
  return Object.fromEntries(keys.map((k) => [k, pctOf(merged[yahooKey[k]]).toString()])) as Record<K, string>;
}

/**
 * Fund aggregates from one Yahoo topHoldings + fundProfile payload (D-03, D-04), or null when invalid.
 * The stock share is usStock only for a US_EQUITY_CATEGORIES category, else it stays in other (Not classified).
 * bondRatings are read only when bondPosition > 0 (equity funds report other: 1). The us_government key is
 * skipped, not folded into aaa: it is a subtotal, since the letter grades alone sum to 1 (live 2026-11-19:
 * AGG 1.0 with us_government 0.4925, BND 1.00000002 with us_government 0.5186). Regions and styleBox are never sourced here.
 */
export function toFundAggregates(top: RawTopHoldings, profile: RawFundProfile | undefined): FundAggregates | null {
  const stock = pctOf(top.stockPosition);
  const cash = pctOf(top.cashPosition);
  const bond = pctOf(top.bondPosition);
  const usStock = US_EQUITY_CATEGORIES.has(profile?.categoryName ?? '') ? stock : new Decimal(0);
  const other = Decimal.max(0, new Decimal(100).minus(cash).minus(bond).minus(usStock));
  const eq = top.equityHoldings;
  const er = profile?.feesExpensesInvestment?.annualReportExpenseRatio;
  const parsed = fundAggregatesSchema.safeParse({
    assetAllocation: { cash: cash.toString(), usStock: usStock.toString(), nonUsStock: '0', bond: bond.toString(), other: other.toString() },
    equityPct: stock.toString(),
    sectors: percentMap(top.sectorWeightings, SECTORS, YAHOO_KEY_BY_SECTOR),
    regions: null,
    styleBox: null,
    valuation: eq
      ? {
          marketCapMil: positive(eq.medianMarketCap, 2),
          pe: inverse(eq.priceToEarnings),
          pb: inverse(eq.priceToBook),
          ps: inverse(eq.priceToSales),
          pcf: inverse(eq.priceToCashflow),
        }
      : null,
    expenseRatioPct: typeof er === 'number' && er >= 0 ? new Decimal(er).times(100).toDecimalPlaces(4).toString() : null,
    bond: bond.gt(0)
      ? {
          sectors: null,
          creditQuality: percentMap(top.bondRatings, CREDIT, YAHOO_CREDIT_KEYS),
          effectiveDurationYears: null,
          effectiveMaturityYears: null,
        }
      : null,
  });
  return parsed.success ? parsed.data : null;
}

/** Yahoo top-10 holdings as percent 0-100 decimal strings plus fund aggregates (D-04, D-05); null when the holdings are invalid. */
export function toFundHoldings(
  ticker: string,
  name: string,
  top: RawTopHoldings,
  profile: RawFundProfile | undefined,
): FundHoldings | null {
  const constituents = (top.holdings ?? [])
    .filter((h) => h.symbol && typeof h.holdingPercent === 'number')
    .map((h) => ({
      ticker: canonicalTicker(h.symbol!),
      name: h.holdingName ?? h.symbol!,
      weightPct: new Decimal(h.holdingPercent!).times(100).toString(),
    }));
  const parsed = fundHoldingsSchema.safeParse({
    name,
    source: 'yahoo-top10',
    constituents,
    aggregates: toFundAggregates(top, profile),
  });
  return parsed.success ? parsed.data : null;
}

/** Sector key, country, market cap in $mil and positive P/x ratios at 4dp; P/CF = marketCap / operatingCashflow (MKT-06, D-05). */
export function toStockMetadata(summary: RawStockSummary): StockMetadata | null {
  const cap = summary.price?.marketCap;
  const cashflow = summary.financialData?.operatingCashflow;
  const sector = summary.assetProfile?.sector;
  const parsed = stockMetadataSchema.safeParse({
    sector: (sector && SECTOR_BY_NAME[sector]) ?? null,
    country: summary.assetProfile?.country ?? null,
    marketCapMil: typeof cap === 'number' ? new Decimal(cap).div(1e6).toDecimalPlaces(2).toString() : null,
    pe: positive(summary.summaryDetail?.trailingPE, 4),
    pb: positive(summary.defaultKeyStatistics?.priceToBook, 4),
    ps: positive(summary.summaryDetail?.priceToSalesTrailing12Months, 4),
    pcf: positive(cap, 0) && positive(cashflow, 0) ? new Decimal(cap!).div(cashflow!).toDecimalPlaces(4).toString() : null,
  });
  return parsed.success ? parsed.data : null;
}

/** Upper bound for one quoteSummary call; a timeout returns null like any other failure (D-05, T-04-07). */
export const YAHOO_TIMEOUT_MS = 5_000;

/** fetch with the timeout started when the queue runs the request, not when it is enqueued. */
const boundedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(YAHOO_TIMEOUT_MS) });

type SummaryModule = 'topHoldings' | 'fundProfile' | 'assetProfile' | 'price' | 'summaryDetail' | 'defaultKeyStatistics' | 'financialData';

/** One bounded quoteSummary call; the payload of a FailedYahooValidationError is used, other errors give null (D-07). */
async function summary<T>(ticker: string, modules: SummaryModule[]): Promise<T | null> {
  try {
    return (await yahoo.quoteSummary(
      yahooSymbol(ticker),
      { modules },
      { fetch: boundedFetch },
    )) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'FailedYahooValidationError') {
      return (error as Error & { result: T }).result;
    }
    return null;
  }
}

/** Yahoo top-10 holdings and fund aggregates for a non-curated fund from one call (MKT-05), or null on failure. */
export async function fetchYahooHoldings(ticker: string, name: string): Promise<FundHoldings | null> {
  const raw = await summary<{ topHoldings?: RawTopHoldings; fundProfile?: RawFundProfile }>(ticker, ['topHoldings', 'fundProfile']);
  return raw?.topHoldings ? toFundHoldings(ticker, name, raw.topHoldings, raw.fundProfile) : null;
}

/** Yahoo profile metadata and ratios for a direct stock, or null on failure. */
export async function fetchYahooMetadata(ticker: string): Promise<StockMetadata | null> {
  const raw = await summary<RawStockSummary>(ticker, ['assetProfile', 'price', 'summaryDetail', 'defaultKeyStatistics', 'financialData']);
  return raw ? toStockMetadata(raw) : null;
}
