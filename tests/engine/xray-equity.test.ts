import Decimal from 'decimal.js';
import { describe, it, expect } from 'vitest';
import { sectors } from '../../src/lib/engine/xray/sectors';
import { regions } from '../../src/lib/engine/xray/regions';
import { computeXray, serializeXray } from '../../src/lib/engine/xray';
import { REGION_GROUPS, SUPER_SECTORS } from '../../src/lib/engine/taxonomy';
import type { EquityBreakdown, XrayInput } from '../../src/lib/engine/xray/types';
import { loadXrayFixture } from './load-fixture';

const sum = (values: Decimal[]) => Decimal.sum(0, ...values).toFixed(1);

function expectExact<K extends string, G extends string>(b: EquityBreakdown<K, G>, groups: Record<G, readonly K[]>) {
  expect(sum([...Object.values<Decimal>(b.leaves), b.notClassified])).toBe('100.0');
  for (const [g, keys] of Object.entries(groups) as [G, K[]][]) {
    expect(sum(keys.map((k) => b.leaves[k]))).toBe(b.groups[g].toFixed(1));
  }
}

function lcg(seed: number) {
  let state = seed;
  return () => (state = (state * 48271) % 2147483647);
}

const basic = () => loadXrayFixture('xray-basic');

const onlyStock = (country: string | null): XrayInput => ({
  holdings: [{ ticker: 'ZZZ', kind: 'STOCK', valueCents: '1000' }],
  funds: {},
  stocks: { ZZZ: { sector: 'energy', country, marketCapMil: null, pe: null, pb: null, ps: null, pcf: null } },
});

describe('sectors', () => {
  it('sums to exactly 100.0 on xray-basic with TSM in Not classified', () => {
    const s = sectors(basic())!;
    expectExact(s, SUPER_SECTORS);
    expect(s.notClassified.toFixed(1)).toBe('2.2');
    expect(s.leaves.technology.toFixed(1)).toBe('37.9');
  });

  it('puts a fund with a null sectors block wholly in Not classified', () => {
    const base = basic();
    const input: XrayInput = {
      holdings: [{ ticker: 'VTI', kind: 'FUND', valueCents: '1000' }],
      funds: { VTI: { ...base.funds.VTI!, sectors: null } },
      stocks: {},
    };
    expect(sectors(input)!.notClassified.toFixed(1)).toBe('100.0');
  });

  it('ignores a fund with null aggregates', () => {
    const base = basic();
    const without = { ...base, holdings: base.holdings.filter((h) => h.ticker !== 'XFND') };
    expect(sectors(base)).toEqual(sectors(without));
  });
});

describe('regions', () => {
  it('maps AAPL to North America and TSM to Asia Developed and sums to 100.0', () => {
    const r = regions(basic())!;
    expectExact(r, REGION_GROUPS);
    expect(r.notClassified.toFixed(1)).toBe('0.0');
    expect(r.leaves.northAmerica.toFixed(1)).toBe('97.1');
    expect(r.leaves.asiaDeveloped.toFixed(1)).toBe('2.3');
  });

  it('puts an unmapped or null country in Not classified', () => {
    expect(regions(onlyStock('Atlantis'))!.notClassified.toFixed(1)).toBe('100.0');
    expect(regions(onlyStock(null))!.notClassified.toFixed(1)).toBe('100.0');
  });
});

describe('equity breakdown edges', () => {
  it('is null for a zero-equity portfolio with no NaN', () => {
    const r = computeXray(loadXrayFixture('xray-no-equity'));
    expect(r.sectors).toBeNull();
    expect(r.regions).toBeNull();
    expect(JSON.stringify(serializeXray(r, null))).not.toContain('NaN');
  });

  it('always sums to exactly 100.0 over 200 random portfolios', () => {
    const base = basic();
    const next = lcg(7);
    for (let run = 0; run < 200; run++) {
      const holdings = base.holdings.map((h) => ({ ...h, valueCents: String(next() % 10_000_000) }));
      const input = { ...base, holdings };
      const s = sectors(input);
      const r = regions(input);
      if (s) expectExact(s, SUPER_SECTORS);
      if (r) expectExact(r, REGION_GROUPS);
    }
  });

  it('serializes sectors and regions at 1dp with a null benchmark side', () => {
    const p = computeXray(basic());
    const s = serializeXray(p, computeXray(loadXrayFixture('xray-no-equity')));
    expect(s.sectors.portfolio!.notClassified).toBe('2.2');
    expect(s.sectors.portfolio!.leaves.technology).toBe('37.9');
    expect(s.regions.portfolio!.groups.americas).toMatch(/^\d+\.\d$/);
    expect(s.sectors.benchmark).toBeNull();
    expect(serializeXray(p, null).regions.benchmark).toBeNull();
  });
});
