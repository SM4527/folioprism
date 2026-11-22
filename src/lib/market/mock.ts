import Decimal from 'decimal.js';
import { z } from 'zod';
import mockFunds from '../../../data/mock-funds.json';
import mockQuotes from '../../../data/mock-quotes.json';
import mockStocks from '../../../data/mock-stocks.json';
import { ALLOCATION_KEYS, BOND_SECTORS, CREDIT, SECTORS, STYLE_STYLES, SUB_REGIONS } from '../engine/taxonomy';
import type { FundData } from '../engine/types';
import type { FundAggregates } from '../engine/xray/types';
import type { MarketQuote, Provenance, StockMetadata } from './types';

const price = z.number().nonnegative().transform(String);

const quoteEntry = z.object({ name: z.string(), quoteType: z.string(), price, asOf: z.iso.datetime() });

/** Curated weights are JSON numbers in percent 0-100, converted to decimal strings only here (D-05). */
const constituent = z.object({
  ticker: z.string(),
  name: z.string(),
  weightPct: z.number().min(0).max(100).transform(String),
  sector: z.string().optional(),
  country: z.string().optional(),
});

/** Ratios, market cap, durations and expense ratio: non-negative numbers to decimal strings (D-03). */
const num = z.number().nonnegative().transform(String).nullable();

/** A 0-100 percent; negatives (sourced short-position artifacts such as BND nr -0.06) clamp to 0. */
const pct = z
  .number()
  .max(100)
  .transform((n) => Decimal.max(0, n).toString());

/** One percent per taxonomy key. */
function percents<K extends string>(keys: readonly K[]) {
  return z.object(Object.fromEntries(keys.map((k) => [k, pct])) as Record<K, typeof pct>);
}

const styleRow = percents(STYLE_STYLES);

/** Where a figure came from; note marks approximations and sibling reuse. */
const source = z.object({ url: z.url(), asOf: z.iso.date(), note: z.string().optional() });

/** The aggregate blocks of one curated fund; a block that could not be sourced is null (D-01, D-02). */
const aggregateBlocks = {
  aggregatesSource: z.array(source.extend({ blocks: z.array(z.string()) })),
  assetAllocation: percents(ALLOCATION_KEYS).nullable(),
  sectors: percents(SECTORS).nullable(),
  regions: percents(SUB_REGIONS).nullable(),
  styleBox: z.object({ large: styleRow, mid: styleRow, small: styleRow }).nullable(),
  valuation: z.object({ marketCapMil: num, pe: num, pb: num, ps: num, pcf: num }).nullable(),
  expenseRatioPct: num,
  bond: z
    .object({
      sectors: percents(BOND_SECTORS).nullable(),
      creditQuality: percents(CREDIT).nullable(),
      effectiveDurationYears: num,
      effectiveMaturityYears: num,
    })
    .nullable(),
};

const fundEntry = z.object({
  ...quoteEntry.shape,
  holdingsAsOf: z.iso.datetime().optional(),
  holdingsSource: z.url({ protocol: /^https?$/ }).optional(),
  constituents: z.array(constituent),
  ...aggregateBlocks,
});

/** Curated facts for a direct stock that Yahoo cannot classify fully; style overrides the P/B rule. */
const stockEntry = z.object({
  name: z.string(),
  sector: z.enum(SECTORS),
  country: z.string(),
  marketCapMil: num,
  pe: num,
  pb: num,
  ps: num,
  pcf: num,
  style: z.enum(STYLE_STYLES).optional(),
  source,
});

const funds = z.record(z.string(), fundEntry).parse(mockFunds);
const stocks = z.record(z.string(), quoteEntry).parse(mockQuotes);
const stockFacts = z.record(z.string(), stockEntry).parse(mockStocks);

/** Curated direct-stock metadata, or undefined when the stock is not curated. */
export function curatedStock(ticker: string): StockMetadata | undefined {
  const entry = stockFacts[ticker];
  if (!entry) return undefined;
  const { sector, country, marketCapMil, pe, pb, ps, pcf, style } = entry;
  return { sector, country, marketCapMil, pe, pb, ps, pcf, ...(style && { style }) };
}

/** True when the fund has curated data in mock-funds.json. */
export function isCurated(ticker: string): boolean {
  return ticker in funds;
}

/** The curated constituents and provenance of a fund, or undefined when it is not curated (D-10). */
export function curatedFund(ticker: string): (FundData & { provenance: Provenance }) | undefined {
  const fund = funds[ticker];
  if (!fund) return undefined;
  const constituents = fund.constituents.map(({ ticker, name, weightPct }) => ({ ticker, name, weightPct }));
  const provenance: Provenance = {
    url: fund.holdingsSource ?? null,
    asOf: fund.holdingsAsOf?.slice(0, 10) ?? null,
    asOfOrigin: 'curated',
    curated: true,
  };
  return { name: fund.name, constituents, source: 'curated', provenance };
}

/** The curated fund-level aggregates as decimal strings, or undefined when the fund is not curated (D-01). */
export function curatedAggregates(ticker: string): FundAggregates | undefined {
  const fund = funds[ticker];
  if (!fund) return undefined;
  const { assetAllocation, sectors, regions, styleBox, valuation, expenseRatioPct, bond } = fund;
  const equityPct = assetAllocation && Decimal.sum(assetAllocation.usStock, assetAllocation.nonUsStock).toString();
  return { assetAllocation, equityPct, sectors, regions, styleBox, valuation, expenseRatioPct, bond };
}

/** The last-resort sample quote, always flagged stale (D-09). */
export function mockQuote(ticker: string): MarketQuote | undefined {
  const entry = funds[ticker] ?? stocks[ticker];
  if (!entry) return undefined;
  return {
    price: entry.price,
    currency: 'USD',
    name: entry.name,
    quoteType: entry.quoteType,
    asOf: new Date(entry.asOf).toISOString(),
    source: 'mock',
    stale: true,
  };
}
