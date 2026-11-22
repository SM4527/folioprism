import Decimal from 'decimal.js';

/**
 * Round `values` to `dp` places so they sum exactly to `target` (D-13).
 * Missing units go to the largest remainders; ties break by larger value, then input order.
 */
export function largestRemainder(values: Decimal[], target: Decimal, dp: number): Decimal[] {
  const unit = new Decimal(10).pow(-dp);
  const floors = values.map((v) => v.toDecimalPlaces(dp, Decimal.ROUND_DOWN));
  const floorSum = floors.reduce((a, b) => a.plus(b), new Decimal(0));
  const missing = target.minus(floorSum).div(unit).round().toNumber();
  const order = values
    .map((v, i) => ({ i, v, rem: v.minus(floors[i]) }))
    .sort((a, b) => b.rem.comparedTo(a.rem) || b.v.comparedTo(a.v) || a.i - b.i);
  const result = [...floors];
  order.slice(0, missing).forEach(({ i }) => (result[i] = result[i].plus(unit)));
  return result;
}
