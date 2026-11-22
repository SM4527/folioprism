import Decimal from 'decimal.js';
import { BOND_SECTORS, CREDIT } from '../taxonomy';
import { isCashLike } from '../ticker';
import type { BondsResult, FundBond, XrayInput } from './types';
import { display, scaled, weights } from './weights';

type Holder = { b: Decimal; bond: FundBond | null };

/** Each fund's bond weight = weight x its scaled bond allocation / 100; stocks and cash are 0 (D-13). */
function holders(input: XrayInput): Holder[] {
  return weights(input).items.flatMap(({ holding, w }) => {
    if (holding.kind !== 'FUND' || isCashLike(holding.ticker)) return [];
    const fund = input.funds[holding.ticker];
    const shares = fund?.assetAllocation && scaled(fund.assetAllocation);
    if (!shares) return [];
    const b = w.times(shares.bond).div(100);
    return b.gt(0) ? [{ b, bond: fund.bond }] : [];
  });
}

/** Bond-weighted 1dp shares over the holdings that have the block, or null when none has it (D-13, D-15). */
function mix<K extends string>(hs: Holder[], keys: readonly K[], pick: (b: FundBond) => Record<K, string> | null) {
  const present = hs.flatMap(({ b, bond }) => {
    const block = bond && pick(bond);
    const s = block && scaled(block);
    return s ? [{ b, s }] : [];
  });
  if (present.length === 0) return null;
  const weight = Decimal.sum(0, ...present.map((p) => p.b));
  const shares = keys.map((k) => Decimal.sum(0, ...present.map((p) => p.b.times(p.s[k] ?? 0))).div(weight));
  const shown = display(shares);
  return Object.fromEntries(keys.map((k, i) => [k, shown[i]])) as Record<K, Decimal>;
}

/** Bond-weighted mean of a years field over holdings with a value, or null. */
function mean(hs: Holder[], pick: (b: FundBond) => string | null): Decimal | null {
  const points = hs.flatMap(({ b, bond }) => {
    const v = bond && pick(bond);
    return v == null ? [] : [{ b, x: new Decimal(v) }];
  });
  if (points.length === 0) return null;
  const weight = Decimal.sum(0, ...points.map((p) => p.b));
  return Decimal.sum(0, ...points.map((p) => p.b.times(p.x))).div(weight);
}

/** Bond analysis weighted by bond value; null when the portfolio holds no bonds (D-13). */
export function bonds(input: XrayInput): BondsResult | null {
  const hs = holders(input);
  if (hs.length === 0) return null;
  return {
    sectors: mix(hs, BOND_SECTORS, (b) => b.sectors),
    credit: mix(hs, CREDIT, (b) => b.creditQuality),
    effectiveDurationYears: mean(hs, (b) => b.effectiveDurationYears),
    effectiveMaturityYears: mean(hs, (b) => b.effectiveMaturityYears),
  };
}
