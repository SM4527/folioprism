import type Decimal from 'decimal.js';
import type { HoldingKind } from '../types';
import type {
  AllocationKey,
  BondSectorKey,
  CreditKey,
  RegionGroupKey,
  SectorKey,
  StyleSize,
  StyleStyle,
  SubRegionKey,
  SuperSectorKey,
} from '../taxonomy';

/** Fund valuation: P/x ratios and market cap in $mil, as decimal strings (D-03). */
export interface FundValuation {
  marketCapMil: string | null;
  pe: string | null;
  pb: string | null;
  ps: string | null;
  pcf: string | null;
}

/** Fund bond stats: sectors and credit in percent of bonds, durations in years (D-13). */
export interface FundBond {
  sectors: Record<BondSectorKey, string> | null;
  creditQuality: Record<CreditKey, string> | null;
  effectiveDurationYears: string | null;
  effectiveMaturityYears: string | null;
}

/**
 * Fund-level aggregates as decimal strings; percents are 0-100 (D-01, D-03).
 * assetAllocation is percent of the fund; sectors, regions and styleBox are percent of equity;
 * equityPct is the stock share of the fund; expenseRatioPct 0.03 means 0.03%.
 */
export interface FundAggregates {
  assetAllocation: Record<AllocationKey, string> | null;
  equityPct: string | null;
  sectors: Record<SectorKey, string> | null;
  regions: Record<SubRegionKey, string> | null;
  styleBox: Record<StyleSize, Record<StyleStyle, string>> | null;
  valuation: FundValuation | null;
  expenseRatioPct: string | null;
  bond: FundBond | null;
}

/** Direct stock facts; country is the raw Yahoo name, mapped by the engine (D-05). */
export interface StockFacts {
  sector: SectorKey | null;
  country: string | null;
  marketCapMil: string | null;
  pe: string | null;
  pb: string | null;
  ps: string | null;
  pcf: string | null;
  /** A curated style that wins over the P/B rule; the market cap still sets the size (D-10). */
  style?: StyleStyle | null;
}

/** One normalized holding; cents as a string so fixtures are JSON (D-07). */
export interface PrismViewHolding {
  ticker: string;
  kind: HoldingKind;
  valueCents: string;
}

/** Immutable Prism View input snapshot; doubles as the JSON fixture format (D-06). */
export interface PrismViewInput {
  holdings: PrismViewHolding[];
  funds: Record<string, FundAggregates | null>;
  stocks: Record<string, StockFacts | null>;
}

/** Style box shares of equity, nine cells plus Not classified (D-09, D-10). */
export interface StyleResult {
  cells: Record<StyleSize, Record<StyleStyle, Decimal>>;
  notClassified: Decimal;
  /** Funds with equity but no holdings-based box, shown as a one-cell estimate (or not classified). */
  fallbackTickers: string[];
}

/** Weighted valuation metrics; null when no holding contributes (D-11). */
export interface ValuationResult {
  marketCapMil: Decimal | null;
  pe: Decimal | null;
  pb: Decimal | null;
  ps: Decimal | null;
  pcf: Decimal | null;
}

/** Weighted expense ratio, annual fee and funds with unknown ER (D-12). */
export interface FeesResult {
  expenseRatioPct: Decimal;
  feeCents: bigint;
  unknownTickers: string[];
}

/** Equity breakdown at 1dp: leaves, group sums of the rounded leaves, and Not classified (D-09, D-15). */
export interface EquityBreakdown<K extends string, G extends string> {
  leaves: Record<K, Decimal>;
  groups: Record<G, Decimal>;
  notClassified: Decimal;
}

/** Bond-weighted analysis: 1dp shares of bonds and mean years; null fields lack data (D-13). */
export interface BondsResult {
  sectors: Record<BondSectorKey, Decimal> | null;
  credit: Record<CreditKey, Decimal> | null;
  effectiveDurationYears: Decimal | null;
  effectiveMaturityYears: Decimal | null;
}

/** Engine output for one portfolio; percents are 1dp display values (D-15). */
export interface PrismViewResult {
  allocation: Record<AllocationKey, Decimal>;
  styleBox: StyleResult | null;
  sectors: EquityBreakdown<SectorKey, SuperSectorKey> | null;
  regions: EquityBreakdown<SubRegionKey, RegionGroupKey> | null;
  valuation: ValuationResult | null;
  fees: FeesResult;
  bonds: BondsResult | null;
}

/** A portfolio value next to its benchmark value (D-14). */
export interface Paired<T> {
  portfolio: T;
  benchmark: T | null;
}

/** Style box as 1dp strings. */
export interface SerializedStyle {
  cells: Record<StyleSize, Record<StyleStyle, string>>;
  notClassified: string;
  fallbackTickers: string[];
}

/** Equity breakdown as 1dp strings. */
export interface SerializedBreakdown<K extends string, G extends string> {
  leaves: Record<K, string>;
  groups: Record<G, string>;
  notClassified: string;
}

/** Valuation as 2dp strings. */
export interface SerializedValuation {
  marketCapMil: string | null;
  pe: string | null;
  pb: string | null;
  ps: string | null;
  pcf: string | null;
}

/** Fees: expenseRatioPct at 4dp, feeCents as an integer string. */
export interface SerializedFees {
  expenseRatioPct: string;
  feeCents: string;
  unknownTickers: string[];
}

/** Bonds: 1dp percents of bonds, 2dp years. */
export interface SerializedBonds {
  sectors: Record<BondSectorKey, string> | null;
  credit: Record<CreditKey, string> | null;
  effectiveDurationYears: string | null;
  effectiveMaturityYears: string | null;
}

/** The Prism View block of /api/analysis (D-16). */
export interface SerializedPrismView {
  allocation: Paired<Record<AllocationKey, string>>;
  styleBox: Paired<SerializedStyle | null>;
  sectors: Paired<SerializedBreakdown<SectorKey, SuperSectorKey> | null>;
  regions: Paired<SerializedBreakdown<SubRegionKey, RegionGroupKey> | null>;
  valuation: Paired<SerializedValuation | null>;
  fees: Paired<SerializedFees>;
  bonds: Paired<SerializedBonds> | null;
}
