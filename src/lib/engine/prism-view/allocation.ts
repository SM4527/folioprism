import Decimal from 'decimal.js';
import { ALLOCATION_KEYS, isUsCountry, type AllocationKey } from '../taxonomy';
import { isCashLike } from '../ticker';
import type { PrismViewHolding, PrismViewInput } from './types';
import { display, scaled, weights } from './weights';

type Block = Partial<Record<AllocationKey, Decimal>>;

const all = (key: AllocationKey): Block => ({ [key]: new Decimal(100) });

/** One holding's allocation block in percent of the holding (D-07). */
function blockOf(h: PrismViewHolding, input: PrismViewInput): Block {
  if (h.kind === 'CASH' || isCashLike(h.ticker)) return all('cash');
  if (h.kind === 'FUND') {
    const block = input.funds[h.ticker]?.assetAllocation;
    return (block && scaled(block)) ?? all('other');
  }
  const country = input.stocks[h.ticker]?.country ?? null;
  if (country === null) return all('other');
  return all(isUsCountry(country) ? 'usStock' : 'nonUsStock');
}

/** Portfolio asset allocation at 1dp, summing to exactly 100.0; all zeros for a zero total (D-07, D-15). */
export function allocation(input: PrismViewInput): Record<AllocationKey, Decimal> {
  const { totalCents, items } = weights(input);
  const sums = ALLOCATION_KEYS.map(() => new Decimal(0));
  for (const { holding, w } of items) {
    const block = blockOf(holding, input);
    ALLOCATION_KEYS.forEach((k, i) => (sums[i] = sums[i].plus(w.times(block[k] ?? 0))));
  }
  const shown = totalCents === 0n ? sums : display(sums);
  return Object.fromEntries(ALLOCATION_KEYS.map((k, i) => [k, shown[i]])) as Record<AllocationKey, Decimal>;
}
