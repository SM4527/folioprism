import Decimal from 'decimal.js';
import { largestRemainder } from '../rounding';
import { isCashLike } from '../ticker';
import type { PrismViewHolding, PrismViewInput } from './types';

export interface WeightedHolding {
  holding: PrismViewHolding;
  w: Decimal;
}

/** Total cents and each holding's weight = valueCents / totalCents, all 0 for a zero total (D-07). */
export function weights(input: PrismViewInput): { totalCents: bigint; items: WeightedHolding[] } {
  const totalCents = input.holdings.reduce((sum, h) => sum + BigInt(h.valueCents), 0n);
  const items = input.holdings.map((holding) => ({
    holding,
    w: totalCents === 0n ? new Decimal(0) : new Decimal(holding.valueCents).div(totalCents.toString()),
  }));
  return { totalCents, items };
}

/** Stock share of a holding as a fraction: stocks 1, cash 0, funds equityPct / 100 (D-08). */
export function equityShare(holding: PrismViewHolding, input: PrismViewInput): Decimal {
  if (holding.kind === 'CASH' || isCashLike(holding.ticker)) return new Decimal(0);
  if (holding.kind === 'STOCK') return new Decimal(1);
  const pct = input.funds[holding.ticker]?.equityPct;
  return pct == null ? new Decimal(0) : new Decimal(pct).div(100);
}

/** Rescale a sourced percent block so it sums to exactly 100, or null when it sums to 0 (D-09). */
export function scaled<K extends string>(block: Record<K, string>): Record<K, Decimal> | null {
  const entries = Object.entries(block) as [K, string][];
  const sum = Decimal.sum(0, ...entries.map(([, v]) => v));
  if (sum.isZero()) return null;
  return Object.fromEntries(entries.map(([k, v]) => [k, new Decimal(v).times(100).div(sum)])) as Record<K, Decimal>;
}

/** Round a vector summing to 100 to 1dp so the shown values sum to exactly 100.0 (D-15). */
export function display(values: Decimal[]): Decimal[] {
  return largestRemainder(values, new Decimal(100), 1);
}

/** The Not classified leaf: 100 minus the classified shares (D-09). */
export function notClassified(classified: Decimal[]): Decimal {
  return new Decimal(100).minus(Decimal.sum(0, ...classified));
}
