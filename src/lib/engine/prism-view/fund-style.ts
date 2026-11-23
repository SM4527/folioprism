import Decimal from 'decimal.js';
import { STYLE_SIZES, STYLE_STYLES } from '../taxonomy';
import type { StyleCellKey } from './classify';
import type { FundAggregates } from './types';

/** Below this share of classified equity a fund keeps the one-cell estimate. */
export const MIN_COVERAGE_PCT = new Decimal(60);

type Constituent = { ticker: string; weightPct: string };

/**
 * A fund's style box in percent of its equity, summed from each constituent's cell. Constituent weights are
 * percent of the fund, so the base is the fund's equity share (100 when unknown), never the listed total:
 * weight missing from a truncated list stays in Not classified and counts against the 60% coverage rule.
 * Null when the fund has no constituents or less than 60% of its equity is classified.
 */
export function fundStyleBox(
  constituents: Constituent[],
  cells: Map<string, StyleCellKey>,
  equityPct: string | null,
): FundAggregates['styleBox'] {
  if (constituents.length === 0) return null;
  const sums = Object.fromEntries(STYLE_SIZES.map((s) => [s, Object.fromEntries(STYLE_STYLES.map((v) => [v, new Decimal(0)]))]));
  let classified = new Decimal(0);
  for (const c of constituents) {
    const cell = cells.get(c.ticker);
    if (!cell) continue;
    sums[cell.size][cell.style] = sums[cell.size][cell.style].plus(c.weightPct);
    classified = classified.plus(c.weightPct);
  }
  const base = Decimal.max(new Decimal(equityPct ?? 100), classified);
  if (base.isZero() || classified.times(100).div(base).lt(MIN_COVERAGE_PCT)) return null;
  const pct = (d: Decimal) => d.times(100).div(base).toString();
  return Object.fromEntries(
    STYLE_SIZES.map((s) => [s, Object.fromEntries(STYLE_STYLES.map((v) => [v, pct(sums[s][v])]))]),
  ) as NonNullable<FundAggregates['styleBox']>;
}
