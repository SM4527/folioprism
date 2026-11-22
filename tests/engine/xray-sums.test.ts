import Decimal from 'decimal.js';
import { describe, it, expect } from 'vitest';
import { computeXray, serializeXray } from '../../src/lib/engine/xray';
import { display } from '../../src/lib/engine/xray/weights';
import {
  BOND_SECTORS,
  CREDIT,
  SUB_REGIONS,
  SECTORS,
  STYLE_SIZES,
  STYLE_STYLES,
} from '../../src/lib/engine/taxonomy';
import type { FundAggregates, XrayHolding, XrayInput } from '../../src/lib/engine/xray/types';

function lcg(seed: number) {
  let state = seed;
  return () => (state = (state * 48271) % 2147483647);
}

type Rand = () => number;

const block = <K extends string>(next: Rand, keys: readonly K[]) =>
  Object.fromEntries(keys.map((k, i) => [k, String(i === 0 ? 1 + (next() % 5000) / 100 : (next() % 5000) / 100)])) as Record<K, string>;

function fund(next: Rand, bondPct: number): FundAggregates {
  const equity = 100 - bondPct;
  return {
    assetAllocation: { cash: '0', usStock: String(equity), nonUsStock: '0', bond: String(bondPct), other: '0' },
    equityPct: String(equity),
    sectors: next() % 4 ? block(next, SECTORS) : null,
    regions: next() % 4 ? block(next, SUB_REGIONS) : null,
    styleBox: next() % 4
      ? (Object.fromEntries(STYLE_SIZES.map((s) => [s, block(next, STYLE_STYLES)])) as FundAggregates['styleBox'])
      : null,
    valuation: { marketCapMil: String(1 + (next() % 900000)), pe: String(next() % 40), pb: '3', ps: null, pcf: '12' },
    expenseRatioPct: '0.05',
    bond:
      bondPct > 0 && next() % 4
        ? {
            sectors: next() % 3 ? block(next, BOND_SECTORS) : null,
            creditQuality: next() % 3 ? block(next, CREDIT) : null,
            effectiveDurationYears: next() % 2 ? String((next() % 1000) / 100) : null,
            effectiveMaturityYears: String((next() % 3000) / 100),
          }
        : null,
  };
}

function portfolio(next: Rand): XrayInput {
  const input: XrayInput = { holdings: [], funds: {}, stocks: {} };
  const n = next() % 7;
  for (let i = 0; i < n; i++) {
    const ticker = `T${i}`;
    const kind = next() % 5;
    const valueCents = String(next() % 3 === 0 ? 0 : next() % 10000000);
    const add = (k: XrayHolding['kind']) => input.holdings.push({ ticker, kind: k, valueCents });
    if (kind === 0) {
      add('STOCK');
      input.stocks[ticker] = next() % 3
        ? { sector: SECTORS[next() % SECTORS.length], country: next() % 2 ? 'United States' : 'Japan', marketCapMil: '50000', pe: '20', pb: '4', ps: null, pcf: null }
        : null;
    } else if (kind === 1) {
      add('CASH');
    } else if (kind === 2) {
      add('FUND');
      input.funds[ticker] = null;
    } else {
      add('FUND');
      input.funds[ticker] = fund(next, kind === 3 ? 0 : [100, 60, 99][next() % 3]);
    }
  }
  return input;
}

const sum1 = (values: string[]) => Decimal.sum(0, ...values).toFixed(1);
const total = (input: XrayInput) => input.holdings.reduce((s, h) => s + BigInt(h.valueCents), 0n);

describe('cross-view exact sums (QUAL-02, XRAY-08)', () => {
  it('sums every non-null group to exactly 100.0 with no NaN over random portfolios', () => {
    let withBonds = 0;
    let zeroEquity = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const input = portfolio(lcg(seed * 104729));
      const x = serializeXray(computeXray(input), null);
      const text = JSON.stringify(x);
      expect(text).not.toContain('NaN');
      expect(text).not.toContain('Infinity');

      const alloc = sum1(Object.values(x.allocation.portfolio));
      expect(alloc).toBe(total(input) === 0n ? '0.0' : '100.0');

      const sectors = x.sectors.portfolio;
      if (sectors) expect(sum1([...Object.values(sectors.leaves), sectors.notClassified])).toBe('100.0');
      else zeroEquity++;
      const regions = x.regions.portfolio;
      if (regions) expect(sum1([...Object.values(regions.leaves), regions.notClassified])).toBe('100.0');
      const style = x.styleBox.portfolio;
      if (style) expect(sum1([...Object.values(style.cells).flatMap((r) => Object.values(r)), style.notClassified])).toBe('100.0');

      const bonds = x.bonds?.portfolio;
      if (bonds) {
        withBonds++;
        if (bonds.sectors) expect(sum1(Object.values(bonds.sectors))).toBe('100.0');
        if (bonds.credit) expect(sum1(Object.values(bonds.credit))).toBe('100.0');
      }
      if (x.bonds === null) expect(x.allocation.portfolio.bond).toBe('0.0');
    }
    expect(withBonds).toBeGreaterThan(30);
    expect(zeroEquity).toBeGreaterThan(10);
  });

  it('display() always sums to exactly 100.0 for vectors scaled to 100', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const next = lcg(seed * 7919);
      const raw = Array.from({ length: 1 + (next() % 12) }, () => new Decimal(1 + (next() % 1000000)));
      const s = Decimal.sum(0, ...raw);
      const shown = display(raw.map((v) => v.times(100).div(s)));
      expect(Decimal.sum(0, ...shown).toFixed(1)).toBe('100.0');
    }
  });
});
