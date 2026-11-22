import type Decimal from 'decimal.js';

export type InputMode = 'SHARES' | 'DOLLARS';

export interface HoldingInput {
  ticker: string;
  inputMode: InputMode;
  shares?: string;
  dollarAmount?: string;
}

export interface Quote {
  price: string;
  name: string;
}

export interface Constituent {
  ticker: string;
  name: string;
  weightPct: string;
}

export type FundSource = 'curated' | 'yahoo-top10' | 'imported';

export interface FundData {
  name: string;
  constituents: Constituent[];
  source: FundSource;
}

/** Immutable engine snapshot; doubles as the JSON fixture format (D-07). */
export interface EngineInput {
  holdings: HoldingInput[];
  quotes: Record<string, Quote>;
  funds: Record<string, FundData>;
}

export type HoldingKind = 'STOCK' | 'FUND' | 'CASH';

export interface ResolvedHolding {
  ticker: string;
  name: string;
  kind: HoldingKind;
  valueCents: bigint;
}

/** One stock exposure from one source; `exposure` is in cents at full precision. */
export interface Exposure {
  stock: string;
  stockName: string;
  sourceTicker: string;
  sourceName: string;
  fundWeightPct: Decimal;
  exposure: Decimal;
}

export interface IntersectionChild {
  sourceTicker: string;
  sourceName: string;
  fundWeightPct: Decimal;
  portfolioPct: Decimal;
  portfolioPctDisplay: Decimal;
  valueCents: bigint;
}

export interface IntersectionRow {
  ticker: string;
  name: string;
  portfolioPct: Decimal;
  portfolioPctDisplay: Decimal;
  valueCents: bigint;
  children: IntersectionChild[];
}

export interface FundCoverage {
  ticker: string;
  coveredPct: Decimal;
  source: FundSource;
}

export interface Coverage {
  lookThroughPct: Decimal;
  otherPct: Decimal;
  perFund: FundCoverage[];
}

export interface IntersectionResult {
  rows: IntersectionRow[];
  coverage: Coverage;
  totalCents: bigint;
}

export interface IntersectionOptions {
  mergeShareClasses: boolean;
}

export interface SerializedChild {
  sourceTicker: string;
  sourceName: string;
  fundWeightPct: string;
  portfolioPct: string;
  portfolioPctDisplay: string;
  valueCents: string;
}

export interface SerializedRow {
  ticker: string;
  name: string;
  portfolioPct: string;
  portfolioPctDisplay: string;
  valueCents: string;
  children: SerializedChild[];
}

export interface SerializedFundCoverage {
  ticker: string;
  coveredPct: string;
  source: FundSource;
}

export interface SerializedIntersection {
  rows: SerializedRow[];
  coverage: { lookThroughPct: string; otherPct: string; perFund: SerializedFundCoverage[] };
  totalCents: string;
}
