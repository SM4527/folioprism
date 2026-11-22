import Decimal from 'decimal.js';
import { describe, it, expect } from 'vitest';
import { bonds } from '../../src/lib/engine/xray/bonds';
import { computeXray, serializeXray } from '../../src/lib/engine/xray';
import { BOND_SECTORS, CREDIT } from '../../src/lib/engine/taxonomy';
import type { FundAggregates, FundBond, XrayInput } from '../../src/lib/engine/xray/types';
import { loadXrayFixture } from './load-fixture';

const sum = (values: Decimal[]) => Decimal.sum(0, ...values).toFixed(1);

const bondFund = (bond: FundBond | null): FundAggregates => ({
  assetAllocation: { cash: '0', usStock: '0', nonUsStock: '0', bond: '100', other: '0' },
  equityPct: '0',
  sectors: null,
  regions: null,
  styleBox: null,
  valuation: null,
  expenseRatioPct: null,
  bond,
});

const govOnly: FundBond = {
  sectors: { government: '100', municipal: '0', corporate: '0', securitized: '0', cash: '0' },
  creditQuality: null,
  effectiveDurationYears: '2',
  effectiveMaturityYears: null,
};

const twoFunds = (a: FundBond | null, b: FundBond | null): XrayInput => ({
  holdings: [
    { ticker: 'A', kind: 'FUND', valueCents: '3000' },
    { ticker: 'B', kind: 'FUND', valueCents: '1000' },
  ],
  funds: { A: bondFund(a), B: bondFund(b) },
  stocks: {},
});

describe('bonds', () => {
  it('weights BND in xray-basic and sums sectors and credit to exactly 100.0', () => {
    const b = bonds(loadXrayFixture('xray-basic'))!;
    expect(sum(BOND_SECTORS.map((k) => b.sectors![k]))).toBe('100.0');
    expect(sum(CREDIT.map((k) => b.credit![k]))).toBe('100.0');
    expect(b.sectors!.government.toFixed(1)).toBe('50.5');
    expect(b.credit!.aa.toFixed(1)).toBe('72.6');
    expect(b.effectiveDurationYears!.toFixed(2)).toBe('5.70');
    expect(b.effectiveMaturityYears!.toFixed(2)).toBe('9.26');
  });

  it('renormalizes a field over the bond holdings that have it', () => {
    const half: FundBond = { ...govOnly, sectors: { ...govOnly.sectors!, government: '0', corporate: '100' } };
    const b = bonds(twoFunds(half, { ...govOnly, effectiveDurationYears: '6' }))!;
    expect(b.sectors!.corporate.toFixed(1)).toBe('75.0');
    expect(b.sectors!.government.toFixed(1)).toBe('25.0');
    expect(b.effectiveDurationYears!.toFixed(2)).toBe('3.00');

    const one = bonds(twoFunds({ ...govOnly, effectiveDurationYears: null }, null))!;
    expect(one.sectors!.government.toFixed(1)).toBe('100.0');
    expect(one.effectiveDurationYears).toBeNull();
  });

  it('gives null fields when no bond holding has them', () => {
    const b = bonds(twoFunds(govOnly, govOnly))!;
    expect(b.credit).toBeNull();
    expect(b.effectiveMaturityYears).toBeNull();
    expect(bonds(twoFunds(null, null))).toEqual({
      sectors: null,
      credit: null,
      effectiveDurationYears: null,
      effectiveMaturityYears: null,
    });
  });

  it('is null for an all-equity portfolio and serializes to null', () => {
    const input: XrayInput = {
      holdings: [{ ticker: 'AAPL', kind: 'STOCK', valueCents: '1000' }],
      funds: {},
      stocks: { AAPL: null },
    };
    expect(bonds(input)).toBeNull();
    expect(serializeXray(computeXray(input), null).bonds).toBeNull();
  });

  it('is non-null with null fields for xray-no-equity', () => {
    const r = computeXray(loadXrayFixture('xray-no-equity'));
    expect(r.bonds).not.toBeNull();
    expect(r.bonds!.sectors).toBeNull();
    expect([r.sectors, r.regions, r.styleBox, r.valuation]).toEqual([null, null, null, null]);
  });

  it('serializes 1dp percents and 2dp years with a null benchmark side', () => {
    const s = serializeXray(computeXray(loadXrayFixture('xray-basic')), null);
    expect(s.bonds!.portfolio.sectors!.government).toBe('50.5');
    expect(s.bonds!.portfolio.effectiveDurationYears).toBe('5.70');
    expect(s.bonds!.benchmark).toBeNull();
  });
});
