import { z } from 'zod';
import type { FundData } from '../engine/types';
import { ALLOCATION_KEYS, BOND_SECTORS, CREDIT, SECTORS, STYLE_STYLES, SUB_REGIONS } from '../engine/taxonomy';
import type { FundAggregates, StockFacts } from '../engine/prism-view/types';

/** A non-negative decimal string, the wire format for every price (D-05). */
export const DECIMAL = z.string().regex(/^\d+(\.\d+)?$/);

export const QUOTE_SOURCES = ['yahoo', 'google', 'cache', 'mock'] as const;
export type QuoteSource = (typeof QUOTE_SOURCES)[number];

/** A validated quote; `asOf` is the provider's market time, not the fetch time (D-04). */
export const marketQuoteSchema = z.object({
  price: DECIMAL,
  currency: z.string(),
  name: z.string(),
  quoteType: z.string(),
  asOf: z.iso.datetime({ offset: true }),
  source: z.enum(QUOTE_SOURCES),
  stale: z.boolean(),
});
export type MarketQuote = z.infer<typeof marketQuoteSchema>;

/** Per-ticker lookup outcome: unknown and unreachable are data, not exceptions (D-12). */
export type QuoteResult = { status: 'ok'; quote: MarketQuote } | { status: 'unknown' } | { status: 'unreachable' };

/** A 0-100 percent as a decimal string (D-05). */
export const PERCENT = DECIMAL.refine((s) => Number(s) <= 100);

/** A z.object with one PERCENT per taxonomy key. */
function percents<K extends string>(keys: readonly K[]) {
  return z.object(Object.fromEntries(keys.map((k) => [k, PERCENT])) as Record<K, typeof PERCENT>);
}

const styleRow = percents(STYLE_STYLES);

/** Fund-level Prism View aggregates as decimal strings; any block may be null (D-01, D-02, D-03). */
export const fundAggregatesSchema = z.object({
  assetAllocation: percents(ALLOCATION_KEYS).nullable(),
  equityPct: PERCENT.nullable(),
  sectors: percents(SECTORS).nullable(),
  regions: percents(SUB_REGIONS).nullable(),
  styleBox: z.object({ large: styleRow, mid: styleRow, small: styleRow }).nullable(),
  valuation: z
    .object({ marketCapMil: DECIMAL.nullable(), pe: DECIMAL.nullable(), pb: DECIMAL.nullable(), ps: DECIMAL.nullable(), pcf: DECIMAL.nullable() })
    .nullable(),
  expenseRatioPct: DECIMAL.nullable(),
  bond: z
    .object({
      sectors: percents(BOND_SECTORS).nullable(),
      creditQuality: percents(CREDIT).nullable(),
      effectiveDurationYears: DECIMAL.nullable(),
      effectiveMaturityYears: DECIMAL.nullable(),
    })
    .nullable(),
}) satisfies z.ZodType<FundAggregates>;

/** One fund's constituents and aggregates from a single source (MKT-05); an empty list is a failed lookup, not data (D-10). */
export const fundHoldingsSchema = z.object({
  name: z.string(),
  source: z.enum(['curated', 'yahoo-top10']),
  constituents: z.array(z.object({ ticker: z.string(), name: z.string(), weightPct: PERCENT })).min(1),
  aggregates: fundAggregatesSchema.nullable(),
});
/** Where a fund's holdings date came from: the curated file, an imported file's own date, or the upload time. */
export type AsOfOrigin = 'curated' | 'file' | 'upload';

/** A fund's holdings source URL and as-of date (YYYY-MM-DD); curated is false for live Yahoo funds. */
export interface Provenance {
  url: string | null;
  asOf: string | null;
  asOfOrigin: AsOfOrigin | null;
  curated: boolean;
}

/** Provenance of a live Yahoo (or failed) fund: Yahoo publishes no holdings date. */
export const LIVE_PROVENANCE: Provenance = { url: null, asOf: null, asOfOrigin: null, curated: false };

export type FundHoldings = FundData & { unavailable?: boolean; aggregates: FundAggregates | null; provenance?: Provenance };

/** Direct stock metadata: sector key, raw country, market cap in $mil and P/x ratios (MKT-06, D-05). */
export const stockMetadataSchema = z.object({
  sector: z.enum(SECTORS).nullable(),
  country: z.string().nullable(),
  marketCapMil: DECIMAL.nullable(),
  pe: DECIMAL.nullable(),
  pb: DECIMAL.nullable(),
  ps: DECIMAL.nullable(),
  pcf: DECIMAL.nullable(),
  style: z.enum(STYLE_STYLES).nullable().optional(),
}) satisfies z.ZodType<StockFacts>;
export type StockMetadata = z.infer<typeof stockMetadataSchema>;
