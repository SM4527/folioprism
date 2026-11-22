import { describe, it, expect } from 'vitest';
import { computeIntersection } from '../../src/lib/engine/intersection';
import { serialize } from '../../src/lib/engine/serialize';
import { loadFixture } from './load-fixture';

const serialized = (name: string) =>
  serialize(computeIntersection(loadFixture(name), { mergeShareClasses: false }));

describe('serialize', () => {
  it('produces JSON-safe output', () => {
    expect(() => JSON.stringify(serialized('basic'))).not.toThrow();
  });

  it('writes cents as integer strings and percents at fixed places', () => {
    const result = serialized('basic');
    expect(result.totalCents).toBe('30676500');
    const aapl = result.rows.find((r) => r.ticker === 'AAPL')!;
    expect(aapl.valueCents).toBe('2409500');
    expect(aapl.portfolioPct).toBe('7.8545');
    expect(aapl.portfolioPctDisplay).toBe('7.85');
    const vti = aapl.children.find((c) => c.sourceTicker === 'VTI')!;
    expect(vti.fundWeightPct).toBe('5.3200');
    expect(vti.portfolioPct).toBe('3.4684');
    expect(vti.portfolioPctDisplay).toBe('3.47');
  });

  it('writes coverage percents at 4dp', () => {
    const { coverage } = serialized('cash-and-bonds');
    expect(coverage.lookThroughPct).toBe('6.7500');
    expect(coverage.otherPct).toBe('83.2500');
    expect(coverage.perFund.map((f) => f.coveredPct)).toEqual(['0.0000', '13.5000']);
  });
});
