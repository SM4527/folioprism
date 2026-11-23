import Decimal from 'decimal.js';
import { STYLE_SIZES, STYLE_STYLES } from '../taxonomy';
import type { StyleCellKey } from './classify';
import type { FundAggregates } from './types';

/** Below this share of classified constituent weight a fund keeps the one-cell estimate. */
export const MIN_COVERAGE_PCT = new Decimal(60);

type Constituent = { ticker: string; weightPct: string };

/**
 * A fund's style box in percent of its constituent weight, summed from each constituent's cell.
 * Unclassified weight is left out (it becomes Not classified), never scaled up.
 * Null when the fund has no constituents or less than 60% of their weight is classified.
 */
export function fundStyleBox(constituents: Constituent[], cells: Map<string, StyleCellKey>): FundAggregates['styleBox'] {
  const total = Decimal.sum(0, ...constituents.map((c) => c.weightPct));
  if (total.isZero()) return null;
  const sums = Object.fromEntries(STYLE_SIZES.map((s) => [s, Object.fromEntries(STYLE_STYLES.map((v) => [v, new Decimal(0)]))]));
  let classified = new Decimal(0);
  for (const c of constituents) {
    const cell = cells.get(c.ticker);
    if (!cell) continue;
    sums[cell.size][cell.style] = sums[cell.size][cell.style].plus(c.weightPct);
    classified = classified.plus(c.weightPct);
  }
  if (classified.times(100).div(total).lt(MIN_COVERAGE_PCT)) return null;
  const pct = (d: Decimal) => d.times(100).div(total).toString();
  return Object.fromEntries(
    STYLE_SIZES.map((s) => [s, Object.fromEntries(STYLE_STYLES.map((v) => [v, pct(sums[s][v])]))]),
  ) as NonNullable<FundAggregates['styleBox']>;
}
