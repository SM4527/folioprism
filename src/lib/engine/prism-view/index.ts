import type Decimal from 'decimal.js';
import { allocation } from './allocation';
import { bonds } from './bonds';
import { fees } from './fees';
import { regions } from './regions';
import { sectors } from './sectors';
import { styleBox } from './style';
import { valuation } from './valuation';
import type {
  BondsResult,
  EquityBreakdown,
  FeesResult,
  Paired,
  SerializedBonds,
  SerializedBreakdown,
  SerializedFees,
  SerializedStyle,
  SerializedValuation,
  SerializedPrismView,
  StyleResult,
  ValuationResult,
  PrismViewInput,
  PrismViewResult,
} from './types';

/** Allocation, style box, sectors, regions, valuation, fees and bonds for one portfolio or benchmark (D-06, D-14). */
export function computePrismView(input: PrismViewInput): PrismViewResult {
  return {
    allocation: allocation(input),
    styleBox: styleBox(input),
    sectors: sectors(input),
    regions: regions(input),
    valuation: valuation(input),
    fees: fees(input),
    bonds: bonds(input),
  };
}

const mapValues = <T, U>(r: Record<string, T>, f: (v: T) => U) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, f(v)]));

const pct = (d: Decimal) => d.toFixed(1);

const style = (s: StyleResult | null): SerializedStyle | null =>
  s && {
    cells: mapValues(s.cells, (row) => mapValues(row, pct)) as SerializedStyle['cells'],
    notClassified: pct(s.notClassified),
    fallbackTickers: s.fallbackTickers,
    sizeBasis: s.sizeBasis,
  };

const breakdown = <K extends string, G extends string>(
  b: EquityBreakdown<K, G> | null,
): SerializedBreakdown<K, G> | null =>
  b && {
    leaves: mapValues(b.leaves, pct) as Record<K, string>,
    groups: mapValues(b.groups, pct) as Record<G, string>,
    notClassified: pct(b.notClassified),
  };

const ratio = (d: Decimal | null) => d?.toFixed(2) ?? null;

const valuationOf = (v: ValuationResult | null): SerializedValuation | null =>
  v && { marketCapMil: ratio(v.marketCapMil), pe: ratio(v.pe), pb: ratio(v.pb), ps: ratio(v.ps), pcf: ratio(v.pcf) };

const feesOf = (f: FeesResult): SerializedFees => ({
  expenseRatioPct: f.expenseRatioPct.toFixed(4),
  feeCents: f.feeCents.toString(),
  unknownTickers: f.unknownTickers,
});

const bondsOf = (b: BondsResult | null): SerializedBonds | null =>
  b && {
    sectors: b.sectors && (mapValues(b.sectors, pct) as SerializedBonds['sectors']),
    credit: b.credit && (mapValues(b.credit, pct) as SerializedBonds['credit']),
    effectiveDurationYears: ratio(b.effectiveDurationYears),
    effectiveMaturityYears: ratio(b.effectiveMaturityYears),
  };

function paired<T>(p: PrismViewResult, b: PrismViewResult | null, f: (r: PrismViewResult) => T): Paired<T> {
  return { portfolio: f(p), benchmark: b && f(b) };
}

/** Wire form: 1dp percents, 2dp valuation, 4dp expense ratio; benchmark fields null without one; bonds null without portfolio bonds (D-13, D-15, D-16). */
export function serializePrismView(portfolio: PrismViewResult, benchmark: PrismViewResult | null): SerializedPrismView {
  return {
    allocation: paired(portfolio, benchmark, (r) => mapValues(r.allocation, pct) as SerializedPrismView['allocation']['portfolio']),
    styleBox: paired(portfolio, benchmark, (r) => style(r.styleBox)),
    sectors: paired(portfolio, benchmark, (r) => breakdown(r.sectors)),
    regions: paired(portfolio, benchmark, (r) => breakdown(r.regions)),
    valuation: paired(portfolio, benchmark, (r) => valuationOf(r.valuation)),
    fees: paired(portfolio, benchmark, (r) => feesOf(r.fees)),
    bonds: portfolio.bonds && { portfolio: bondsOf(portfolio.bonds)!, benchmark: benchmark && bondsOf(benchmark.bonds) },
  };
}
