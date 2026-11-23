import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { BENCHMARK_TICKERS } from '../../src/lib/benchmarks';
import { STYLE_SIZES, STYLE_STYLES } from '../../src/lib/engine/taxonomy';
import { computePrismView } from '../../src/lib/engine/prism-view';
import type { PrismViewInput } from '../../src/lib/engine/prism-view/types';
import { curatedAggregates, curatedStock } from '../../src/lib/market/mock';
import { curatedWithStyle } from '../../src/lib/market/stock-facts';
import mockFunds from '../../data/mock-funds.json';

const FUNDS = [
  'VTIAX', 'VTSAX', 'FSKAX', 'QQQ', 'VPU', 'ITOT', 'IXUS', 'SPTM', 'SPDW', 'VTI',
  'VXUS', 'VOO', 'SCHF', 'DGRO', 'VIG', 'VYM', 'VIGI', 'VYMI', 'HDEF', 'SCHY', 'VT', 'SPY',
];

/** A portfolio of one fund at 100%. */
const oneFund = (ticker: string): PrismViewInput => ({
  holdings: [{ ticker, kind: 'FUND', valueCents: '1000000' }],
  funds: { [ticker]: curatedAggregates(ticker)! },
  stocks: {},
});

describe('curated fund coverage', () => {
  it.each(FUNDS)('%s alone has no Not classified sectors, regions or style', (t) => {
    const x = computePrismView(oneFund(t));
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

/** The sample funds whose top 200 holdings are in data/stock-facts.sample.json. */
const SAMPLE_FUNDS = ['VTI', 'FXAIX', 'QQQ', 'SCHD', 'SPY'];

const cells = (x: ReturnType<typeof computePrismView>) =>
  STYLE_SIZES.flatMap((size) => STYLE_STYLES.map((st) => x.styleBox!.cells[size][st]));

/** One fund at 100% with its style box calculated from holdings, as the app does. */
const calculated = (ticker: string): PrismViewInput => ({ ...oneFund(ticker), funds: { [ticker]: curatedWithStyle(ticker)! } });

describe('style box calculated from holdings (sample facts)', () => {
  it.each(SAMPLE_FUNDS)('%s gets a holdings-based box over 3+ cells that sums to exactly 100.0', (t) => {
    expect(curatedWithStyle(t)!.styleBox).not.toBeNull();
    const x = computePrismView(calculated(t));
    expect(cells(x).filter((c) => c.gt(0)).length).toBeGreaterThanOrEqual(3);
    expect(Decimal.sum(...cells(x), x.styleBox!.notClassified).toFixed(1)).toBe('100.0');
    expect(x.styleBox!.fallbackTickers).toEqual([]);
  });

  it('leaves the uncovered share of VTI in Not classified instead of scaling up', () => {
    const x = computePrismView(calculated('VTI'));
    expect(x.styleBox!.notClassified.gt(0)).toBe(true);
    expect(x.styleBox!.notClassified.lt(40)).toBe(true);
  });

  it.each(['VXUS', 'HDEF'])('%s is outside the sample facts and falls back, listed in fallbackTickers', (t) => {
    expect(curatedWithStyle(t)!.styleBox).toBeNull();
    expect(computePrismView(calculated(t)).styleBox!.fallbackTickers).toEqual([t]);
  });

  it.each(Object.keys(mockFunds))('%s has no calculated box without equity constituents', (t) => {
    const a = curatedWithStyle(t)!;
    if (new Decimal(a.equityPct ?? 0).isZero()) expect(a.styleBox).toBeNull();
  });
});

describe('curated direct stocks', () => {
  it('has no facts for an uncurated stock', () => {
    expect(curatedStock('ZZZZ')).toBeUndefined();
  });
});
