import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import fundSources from '../data/fund-sources.json';
import mockFunds from '../data/mock-funds.json';
import { canonicalTicker } from '../src/lib/engine/ticker';
import { curatedAggregates, curatedFund } from '../src/lib/market/mock';
import { fundAggregatesSchema } from '../src/lib/market/types';

const TICKERS = Object.keys(mockFunds);
const TOP10 = ['VXUS', 'VPU', 'VIG', 'VYM', 'VIGI', 'VYMI', 'VT', 'SPTM', 'IXUS', 'SCHY', 'HDEF', 'VTIAX'];
const MIN_COUNT: Record<string, number> = {
  VTI: 50, FXAIX: 50, FSKAX: 50, VOO: 50, SPY: 50, QQQ: 90, SCHD: 95, VTSAX: 50,
  SPDW: 9, SCHF: 9, ITOT: 1000, DGRO: 300,
  ...Object.fromEntries(TOP10.map((t) => [t, 10])),
};
const BOND_FUNDS = new Set(['BND', 'AGG']);

/** Sum of the numeric values of a flat record. */
function total(values: Record<string, number>): number {
  return Object.values(values).reduce((s, v) => s + v, 0);
}

describe('curatedFund', () => {
  it('returns VTI as curated FundData with decimal-string weights', () => {
    const vti = curatedFund('VTI')!;
    expect(vti.source).toBe('curated');
    expect(vti.name).toBe('Vanguard Total Stock Market ETF');
    expect(typeof vti.constituents[0].weightPct).toBe('string');
  });

  it('is undefined for a fund that is not curated', () => {
    expect(curatedFund('ZZZZ')).toBeUndefined();
  });

  it.each(TICKERS)('%s weights are 0-100 percent and sum to at most 100', (t) => {
    const fund = curatedFund(t)!;
    for (const c of fund.constituents) {
      expect(Number(c.weightPct)).toBeGreaterThanOrEqual(0);
      expect(Number(c.weightPct)).toBeLessThanOrEqual(100);
    }
    expect(Decimal.sum(0, ...fund.constituents.map((c) => c.weightPct)).lte(100)).toBe(true);
  });

  it.each(TICKERS)('%s has the expected constituent count', (t) => {
    const count = curatedFund(t)!.constituents.length;
    if (BOND_FUNDS.has(t)) expect(count).toBe(0);
    else expect(count).toBeGreaterThanOrEqual(MIN_COUNT[t]);
  });

  it.each(TICKERS)('%s tickers are canonical and unique', (t) => {
    const tickers = curatedFund(t)!.constituents.map((c) => c.ticker);
    for (const ticker of tickers) expect(ticker).toBe(canonicalTicker(ticker));
    expect(new Set(tickers).size).toBe(tickers.length);
  });

  it.each(Object.keys(fundSources))('%s from fund-sources records an https holdingsSource and a holdingsAsOf', (t) => {
    const fund = (mockFunds as Record<string, { holdingsSource?: string; holdingsAsOf?: string }>)[t];
    expect(fund.holdingsSource).toMatch(/^https:\/\//);
    expect(fund.holdingsAsOf).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('holds AAPL in VTI, FXAIX and QQQ, and both Alphabet classes in VTI and FXAIX', () => {
    const has = (fund: string, t: string) => curatedFund(fund)!.constituents.some((c) => c.ticker === t);
    for (const f of ['VTI', 'FXAIX', 'QQQ']) expect(has(f, 'AAPL')).toBe(true);
    for (const f of ['VTI', 'FXAIX']) {
      expect(has(f, 'GOOGL')).toBe(true);
      expect(has(f, 'GOOG')).toBe(true);
    }
  });
});

describe('aggregate blocks', () => {
  const entries = Object.entries(mockFunds as Record<string, Record<string, unknown>>);
  const near100 = (n: number) => expect(Math.abs(n - 100)).toBeLessThanOrEqual(0.5);
  const BLOCKS = ['assetAllocation', 'sectors', 'regions', 'styleBox', 'valuation', 'expenseRatioPct', 'bond'];

  it.each(entries)('%s raw aggregates sum to 100 where present', (_t, fund) => {
    for (const b of ['assetAllocation', 'sectors', 'regions'])
      if (fund[b]) near100(total(fund[b] as Record<string, number>));
    if (fund.styleBox) {
      const cells = Object.values(fund.styleBox as Record<string, Record<string, number>>).flatMap((row) => Object.values(row));
      expect(cells).toHaveLength(9);
      expect(Math.abs(cells.reduce((s, v) => s + v, 0) - 100)).toBeLessThanOrEqual(2);
    }
    const bond = fund.bond as { sectors: Record<string, number> | null; creditQuality: Record<string, number> | null } | null;
    if (bond?.sectors) near100(total(bond.sectors));
    if (bond?.creditQuality) near100(total(bond.creditQuality));
  });

  it.each(entries)('%s cites a source for a non-null styleBox', (_t, fund) => {
    if (!fund.styleBox) return;
    const sources = fund.aggregatesSource as { blocks: string[] }[];
    expect(sources.some((s) => s.blocks.includes('styleBox'))).toBe(true);
  });

  it.each(entries)('%s has every block key, as a value or explicit null (D-02)', (_t, fund) => {
    for (const b of BLOCKS) expect(fund).toHaveProperty(b);
  });

  it.each(TICKERS)('%s parses with fundAggregatesSchema', (t) => {
    expect(fundAggregatesSchema.safeParse(curatedAggregates(t)).success).toBe(true);
  });

  it('VTI loads as decimal strings that sum to 100', () => {
    const vti = curatedAggregates('VTI')!;
    for (const block of [vti.assetAllocation!, vti.sectors!, vti.regions!]) {
      for (const v of Object.values(block)) expect(typeof v).toBe('string');
      near100(Decimal.sum(...Object.values(block)).toNumber());
    }
    const a = vti.assetAllocation!;
    expect(vti.equityPct).toBe(new Decimal(a.usStock).plus(a.nonUsStock).toString());
    expect(vti.bond).toBeNull();
  });

  it('BND credit quality has an nr key, clamps the sourced -0.06 to 0 and sums to 100', () => {
    const bond = curatedAggregates('BND')!.bond!;
    expect(Object.keys(bond.creditQuality!).sort()).toEqual(['a', 'aa', 'aaa', 'b', 'bb', 'bbb', 'belowB', 'nr']);
    expect(bond.creditQuality!.nr).toBe('0');
    for (const v of Object.values(bond.creditQuality!)) expect(new Decimal(v).gte(0)).toBe(true);
    near100(Decimal.sum(...Object.values(bond.creditQuality!)).toNumber());
    near100(Decimal.sum(...Object.values(bond.sectors!)).toNumber());
    expect(bond.effectiveMaturityYears).toMatch(/^\d+(\.\d+)?$/);
  });

  it('keeps null blocks null and is undefined for a fund that is not curated', () => {
    const bnd = curatedAggregates('BND')!;
    expect(bnd.sectors).toBeNull();
    expect(bnd.regions).toBeNull();
    expect(bnd.styleBox).toBeNull();
    expect(bnd.equityPct).toBe('0');
    expect(curatedAggregates('XXXX')).toBeUndefined();
  });

  it('reuses the sibling portfolio for share classes', () => {
    expect(curatedFund('VTSAX')!.constituents).toEqual(curatedFund('VTI')!.constituents);
    expect(curatedFund('VTIAX')!.constituents).toEqual(curatedFund('VXUS')!.constituents);
  });

  it.each(entries)('%s gives every sourced block a url and an ISO date', (_t, fund) => {
    for (const s of fund.aggregatesSource as { url: string; asOf: string; note?: string }[]) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('keeps curatedFund to constituents plus provenance', () => {
    const vti = curatedFund('VTI')!;
    expect(Object.keys(vti).sort()).toEqual(['constituents', 'name', 'provenance', 'source']);
    expect(Object.keys(vti.constituents[0]).sort()).toEqual(['name', 'ticker', 'weightPct']);
  });
});
