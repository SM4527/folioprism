import Decimal from 'decimal.js';
import { describe, it, expect } from 'vitest';
import { largestRemainder } from '../../src/lib/engine/rounding';

const run = (values: string[], target: string, dp: number) =>
  largestRemainder(values.map((v) => new Decimal(v)), new Decimal(target), dp).map((d) =>
    d.toFixed(dp),
  );

function lcg(seed: number) {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state;
  };
}

describe('largestRemainder', () => {
  it('breaks full ties by input order', () => {
    expect(run(['1.005', '1.005', '0.990'], '3.00', 2)).toEqual(['1.01', '1.00', '0.99']);
  });

  it('breaks remainder ties by larger original value', () => {
    expect(run(['2.005', '1.005', '0.990'], '4.00', 2)).toEqual(['2.01', '1.00', '0.99']);
  });

  it('splits the basic AAPL row at 4dp', () => {
    expect(run(['3.46843245', '2.18080950', '2.20525804'], '7.8545', 4)).toEqual([
      '3.4684',
      '2.1808',
      '2.2053',
    ]);
  });

  it('always hits its target within one unit per value', () => {
    for (let n = 1; n <= 6; n++) {
      for (let seed = 1; seed <= 50; seed++) {
        const next = lcg(seed * 7919 + n);
        const values = Array.from({ length: n }, () => new Decimal(next() % 100000000).div(1e6));
        for (const dp of [2, 4]) {
          const sum = values.reduce((a, b) => a.plus(b), new Decimal(0));
          const target = sum.toDecimalPlaces(dp, Decimal.ROUND_HALF_EVEN);
          const result = largestRemainder(values, target, dp);
          const unit = new Decimal(10).pow(-dp);
          expect(result.reduce((a, b) => a.plus(b), new Decimal(0)).equals(target)).toBe(true);
          result.forEach((r, i) => expect(r.minus(values[i]).abs().lte(unit)).toBe(true));
        }
      }
    }
  });
});
