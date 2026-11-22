import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { BENCHMARK_TICKERS } from '../../src/lib/benchmarks';
import { STYLE_SIZES, STYLE_STYLES } from '../../src/lib/engine/taxonomy';
import { computeXray } from '../../src/lib/engine/xray';
import type { XrayInput } from '../../src/lib/engine/xray/types';
import { curatedAggregates, curatedStock } from '../../src/lib/market/mock';
import mockFunds from '../../data/mock-funds.json';

const FUNDS = [
  'VTIAX', 'VTSAX', 'FSKAX', 'QQQ', 'VPU', 'ITOT', 'IXUS', 'SPTM', 'SPDW', 'VTI',
  'VXUS', 'VOO', 'SCHF', 'DGRO', 'VIG', 'VYM', 'VIGI', 'VYMI', 'HDEF', 'SCHY', 'VT', 'SPY',
];

/** A portfolio of one fund at 100%. */
const oneFund = (ticker: string): XrayInput => ({
  holdings: [{ ticker, kind: 'FUND', valueCents: '1000000' }],
  funds: { [ticker]: curatedAggregates(ticker)! },
  stocks: {},
});

describe('curated fund coverage', () => {
  it.each(FUNDS)('%s alone has no Not classified sectors, regions or style', (t) => {
    const x = computeXray(oneFund(t));
    expect(x.sectors!.notClassified.toFixed(1)).toBe('0.0');
    expect(x.regions!.notClassified.toFixed(1)).toBe('0.0');
    expect(x.styleBox!.notClassified.toFixed(1)).toBe('0.0');
    expect(curatedAggregates(t)!.assetAllocation).not.toBeNull();
    expect(curatedAggregates(t)!.expenseRatioPct).not.toBeNull();
  });

  it.each(BENCHMARK_TICKERS)('benchmark %s has an asset allocation', (t) => {
    expect(curatedAggregates(t)!.assetAllocation).not.toBeNull();
  });

  it.each(['VT', 'VXUS'])('benchmark %s has sectors and regions', (t) => {
    expect(curatedAggregates(t)!.sectors).not.toBeNull();
    expect(curatedAggregates(t)!.regions).not.toBeNull();
  });
});

const US_STYLE = [
  'SPY', 'VOO', 'FXAIX', 'VTI', 'VTSAX', 'FSKAX',
  'ITOT', 'SPTM', 'QQQ', 'SCHD', 'VPU', 'VIG', 'VYM', 'DGRO',
];

const cells = (x: ReturnType<typeof computeXray>) =>
  STYLE_SIZES.flatMap((size) => STYLE_STYLES.map((st) => x.styleBox!.cells[size][st]));

describe('published style box (XRAY-10, XRAY-11)', () => {
  it.each(US_STYLE)('%s spreads across its published style box', (t) => {
    expect(curatedAggregates(t)!.styleBox).not.toBeNull();
    expect(cells(computeXray(oneFund(t))).filter((c) => c.gt(0)).length).toBeGreaterThanOrEqual(2);
  });

  it.each(Object.keys(mockFunds))('%s has a style box exactly when it holds equity', (t) => {
    const a = curatedAggregates(t)!;
    if (new Decimal(a.equityPct ?? 0).gt(0)) expect(a.styleBox).not.toBeNull();
    else expect(a.styleBox).toBeNull();
  });

  it.each(['VT', 'VXUS'])('benchmark %s spreads across at least 3 style cells', (t) => {
    expect(cells(computeXray(oneFund(t))).filter((c) => c.gt(0)).length).toBeGreaterThanOrEqual(3);
  });

  it('SPY benchmark is not all Large Growth and has Large Value', () => {
    const x = computeXray(oneFund('SPY'));
    expect(x.styleBox!.cells.large.growth.lt(100)).toBe(true);
    expect(x.styleBox!.cells.large.value.gt(0)).toBe(true);
    expect(cells(x).filter((c) => c.gt(0)).length).toBeGreaterThanOrEqual(3);
    expect(Decimal.sum(...cells(x), x.styleBox!.notClassified).toFixed(1)).toBe('100.0');
  });
});

describe('curated direct stocks', () => {
  it('has no facts for an uncurated stock', () => {
    expect(curatedStock('ZZZZ')).toBeUndefined();
  });
});
