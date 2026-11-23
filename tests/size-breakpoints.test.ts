import Decimal from 'decimal.js';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXED_THRESHOLDS, sizeOf } from '../src/lib/engine/prism-view/classify';
import { computePrismView } from '../src/lib/engine/prism-view';
import { styleBox } from '../src/lib/engine/prism-view/style';
import type { PrismViewInput } from '../src/lib/engine/prism-view/types';
import { readBreakpoints, sizeThresholds, thresholdsFrom } from '../src/lib/market/size-breakpoints';
import { curatedWithStyle } from '../src/lib/market/stock-facts';
import { cutoffWeights, totalAgeLine, type Breakpoints } from '../src/lib/refresh/size-breakpoints';
import mockFunds from '../data/mock-funds.json';

const committed = readBreakpoints()!;

describe('cutoffWeights', () => {
  it('returns the weights where the running total, largest first, reaches 70% and 90%', () => {
    const list = [40, 25, 10, 9, 8, 5, 3].map((weightPct, i) => ({ ticker: `ZZ${i}`, weightPct }));
    expect(cutoffWeights(list)).toEqual({ largeCutoffWeightPct: 10, midCutoffWeightPct: 8 });
  });

  it('matches the committed file for the committed VTI holdings', () => {
    const { largeCutoffWeightPct, midCutoffWeightPct } = cutoffWeights(mockFunds.VTI.constituents);
    expect({ largeCutoffWeightPct, midCutoffWeightPct }).toEqual({
      largeCutoffWeightPct: committed.largeCutoffWeightPct,
      midCutoffWeightPct: committed.midCutoffWeightPct,
    });
    expect(committed.weightsAsOf).toBe(mockFunds.VTI.holdingsAsOf.slice(0, 10));
  });
});

describe('size thresholds', () => {
  it('converts the cut-off weights to dollars with the hand-entered total', () => {
    expect(thresholdsFrom(committed)).toEqual({ largeMinMil: '86240', midMinMil: '15680', basis: 'market' });
  });

  it('puts the boundaries exactly at the computed thresholds', () => {
    const t = thresholdsFrom(committed);
    expect(sizeOf(new Decimal('86240'), t)).toBe('large');
    expect(sizeOf(new Decimal('86239.99'), t)).toBe('mid');
    expect(sizeOf(new Decimal('15680'), t)).toBe('mid');
    expect(sizeOf(new Decimal('15679.99'), t)).toBe('small');
  });

  it('scales with the total', () => {
    const t = thresholdsFrom({ ...committed, totalUsMarketValueUsd: committed.totalUsMarketValueUsd * 1.1 });
    expect(t.largeMinMil).toBe('94864');
  });

  it('falls back to the fixed $10B / $2B cut-offs when the file is missing, and says so', () => {
    expect(readBreakpoints(path.join('data', 'no-such-breakpoints.json'))).toBeNull();
    expect(thresholdsFrom(null)).toEqual(FIXED_THRESHOLDS);
    const input: PrismViewInput = {
      holdings: [{ ticker: 'ZZST', kind: 'STOCK', valueCents: '100' }],
      funds: {},
      stocks: { ZZST: { sector: null, country: null, marketCapMil: '50000', pe: null, pb: '3', ps: null, pcf: null } },
    };
    expect(styleBox(input)!.sizeBasis).toBe('fixed');
    expect(styleBox(input)!.cells.large.blend.toFixed(1)).toBe('100.0');
    expect(styleBox({ ...input, sizeThresholds: thresholdsFrom(committed) })!.sizeBasis).toBe('market');
    expect(styleBox({ ...input, sizeThresholds: thresholdsFrom(committed) })!.cells.mid.blend.toFixed(1)).toBe('100.0');
  });
});

describe('VTI on the sample data', () => {
  it('comes out roughly 70/20/10 by size', () => {
    const x = computePrismView({
      holdings: [{ ticker: 'VTI', kind: 'FUND', valueCents: '1000000' }],
      funds: { VTI: curatedWithStyle('VTI')! },
      stocks: {},
      sizeThresholds: sizeThresholds(),
    });
    const row = (s: 'large' | 'mid' | 'small') => Decimal.sum(...Object.values(x.styleBox!.cells[s])).toNumber();
    expect(Math.abs(row('large') - 70)).toBeLessThanOrEqual(3);
    expect(Math.abs(row('mid') - 20)).toBeLessThanOrEqual(3);
    expect(row('small')).toBeGreaterThanOrEqual(5);
    expect(row('small')).toBeLessThanOrEqual(10);
    expect(x.styleBox!.notClassified.toNumber()).toBeLessThan(5);
  });
});

describe('totalAgeLine', () => {
  const b: Breakpoints = { ...committed, asOf: '2026-11-20' };

  it('prints the as-of date and age', () => {
    expect(totalAgeLine(b, new Date('2026-12-20T12:00:00Z'))).toBe(
      `size breakpoints: total US market value as of 2026-11-20 (30 days old), cut-off weights as of ${b.weightsAsOf}`,
    );
  });

  it('warns when the total is older than 180 days', () => {
    expect(totalAgeLine(b, new Date('2027-05-19T12:00:00Z'))).not.toContain('WARNING');
    expect(totalAgeLine(b, new Date('2027-05-20T12:00:00Z'))).toContain('WARNING: the total is older than 180 days');
  });
});
