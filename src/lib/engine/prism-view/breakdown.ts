import Decimal from 'decimal.js';
import type { EquityBreakdown, PrismViewHolding, PrismViewInput } from './types';
import { display, equityShare, notClassified, weights } from './weights';

/** A holding's percent-of-equity block over the keys, or null for Not classified. */
export type Classify<K extends string> = (holding: PrismViewHolding) => Partial<Record<K, Decimal>> | null;

/**
 * Equity-weighted breakdown at 1dp: leaves plus Not classified sum to exactly 100.0 and each
 * group is the sum of its rounded children; null without equity (D-08, D-09, D-15, D-21).
 */
export function equityBreakdown<K extends string, G extends string>(
  input: PrismViewInput,
  keys: readonly K[],
  groups: Record<G, readonly K[]>,
  classify: Classify<K>,
): EquityBreakdown<K, G> | null {
  const sums = keys.map(() => new Decimal(0));
  let equity = new Decimal(0);
  for (const { holding, w } of weights(input).items) {
    const e = w.times(equityShare(holding, input));
    if (e.isZero()) continue;
    equity = equity.plus(e);
    const block = classify(holding);
    if (block) keys.forEach((k, i) => (sums[i] = sums[i].plus(e.times(block[k] ?? 0))));
  }
  if (equity.isZero()) return null;
  const classified = sums.map((s) => s.div(equity));
  const shown = display([...classified, notClassified(classified)]);
  const leaves = Object.fromEntries(keys.map((k, i) => [k, shown[i]])) as Record<K, Decimal>;
  const groupSums = Object.fromEntries(
    (Object.entries(groups) as [G, K[]][]).map(([g, ks]) => [g, Decimal.sum(0, ...ks.map((k) => leaves[k]))]),
  ) as Record<G, Decimal>;
  return { leaves, groups: groupSums, notClassified: shown[keys.length] };
}

/** A single key at 100, or null when the key is unknown. */
export function single<K extends string>(key: K | null | undefined): Partial<Record<K, Decimal>> | null {
  return key ? ({ [key]: new Decimal(100) } as Partial<Record<K, Decimal>>) : null;
}
