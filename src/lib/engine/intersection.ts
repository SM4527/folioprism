import Decimal from 'decimal.js';
import { computeCoverage } from './coverage';
import { lookThrough } from './look-through';
import { canonicalizeInput, normalize, toCents } from './normalize';
import { largestRemainder } from './rounding';
import { groupTicker } from './ticker';
import type {
  EngineInput,
  Exposure,
  IntersectionChild,
  IntersectionOptions,
  IntersectionResult,
  IntersectionRow,
} from './types';

const TOP_N = 50;

/** Sort by cents descending, then ticker ascending. */
const byValueThenTicker = (a: bigint, b: bigint, ta: string, tb: string) =>
  a !== b ? (a > b ? -1 : 1) : ta < tb ? -1 : ta > tb ? 1 : 0;

function groupBy(exposures: Exposure[], key: (e: Exposure) => string): Map<string, Exposure[]> {
  const groups = new Map<string, Exposure[]>();
  for (const e of exposures) groups.set(key(e), [...(groups.get(key(e)) ?? []), e]);
  return groups;
}

/** One child per source with exposures and weights summed, then rounded to cents (D-11). */
function mergeSources(exposures: Exposure[]) {
  return [...groupBy(exposures, (e) => e.sourceTicker)]
    .map(([sourceTicker, es]) => ({
      sourceTicker,
      sourceName: es[0].sourceName,
      fundWeightPct: Decimal.sum(0, ...es.map((e) => e.fundWeightPct)),
      valueCents: toCents(Decimal.sum(0, ...es.map((e) => e.exposure))),
    }))
    .filter((c) => c.valueCents > 0n)
    .sort((a, b) => byValueThenTicker(a.valueCents, b.valueCents, a.sourceTicker, b.sourceTicker));
}

/** Split a parent percent across children in proportion to their cents (D-12). */
function split(cents: bigint[], parentCents: bigint, target: Decimal, dp: number): Decimal[] {
  const parts = cents.map((c) => new Decimal(c.toString()).div(parentCents.toString()).times(target));
  return largestRemainder(parts, target, dp);
}

function buildRow(ticker: string, name: string, exposures: Exposure[], totalCents: bigint): IntersectionRow {
  const sources = mergeSources(exposures);
  const valueCents = sources.reduce((sum, c) => sum + c.valueCents, 0n);
  const ratio = new Decimal(valueCents.toString()).div(totalCents.toString()).times(100);
  const portfolioPct = ratio.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
  const portfolioPctDisplay = ratio.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
  const cents = sources.map((c) => c.valueCents);
  const pct4 = split(cents, valueCents, portfolioPct, 4);
  const pct2 = split(cents, valueCents, portfolioPctDisplay, 2);
  const children: IntersectionChild[] = sources.map((c, i) => ({
    ...c,
    portfolioPct: pct4[i],
    portfolioPctDisplay: pct2[i],
  }));
  return { ticker, name, portfolioPct, portfolioPctDisplay, valueCents, children };
}

/** Parent name: the group ticker's quote, else an exposure of that exact ticker (D-15). */
function rowName(ticker: string, exposures: Exposure[], input: EngineInput): string {
  return (
    input.quotes[ticker]?.name ??
    exposures.find((e) => e.stock === ticker)?.stockName ??
    exposures[0].stockName
  );
}

/** Top 50 look-through rows whose children sum exactly to their parents (D-09, D-19). */
export function computeIntersection(raw: EngineInput, options: IntersectionOptions): IntersectionResult {
  const input = canonicalizeInput(raw);
  const { holdings, totalCents } = normalize(input);
  const exposures = lookThrough(holdings, input.funds);
  const groups = groupBy(exposures, (e) => groupTicker(e.stock, options.mergeShareClasses));
  const rows = [...groups]
    .filter(([ticker]) => !ticker.startsWith('OTHER:'))
    .map(([ticker, es]) => buildRow(ticker, rowName(ticker, es, input), es, totalCents))
    .filter((r) => r.children.length > 0)
    .sort((a, b) => byValueThenTicker(a.valueCents, b.valueCents, a.ticker, b.ticker))
    .slice(0, TOP_N);
  return { rows, coverage: computeCoverage(input, exposures, totalCents), totalCents };
}
