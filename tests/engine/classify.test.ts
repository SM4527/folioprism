import { describe, expect, it } from 'vitest';
import { classifyUniverse, FIXED_THRESHOLDS, type StockFact } from '../../src/lib/engine/prism-view/classify';

/** Style ranking tests use the fixed cut-offs; size cut-offs are tested in size-breakpoints.test.ts. */
const classify = (facts: Record<string, StockFact>) => classifyUniverse(facts, FIXED_THRESHOLDS);

const fact = (marketCapMil: string | null, pe: string | null, pb: string | null, divYieldPct: string | null): StockFact => ({
  marketCapMil,
  pe,
  pb,
  divYieldPct,
});

describe('classifyUniverse', () => {
  it('orders a band into value, blend and growth by its yields', () => {
    const cells = classify({
      CHEAP: fact('50000', '8', '0.9', '4'),
      MIDDL: fact('50000', '18', '3', '1.5'),
      PRICY: fact('50000', '60', '20', '0'),
    });
    expect(cells.get('CHEAP')).toEqual({ size: 'large', style: 'value' });
    expect(cells.get('MIDDL')).toEqual({ size: 'large', style: 'blend' });
    expect(cells.get('PRICY')).toEqual({ size: 'large', style: 'growth' });
  });

  it('ranks within each size band, so another band does not move a stock', () => {
    const large = { LGA: fact('50000', '8', '1', '3'), LGB: fact('50000', '40', '9', '0') };
    const alone = classify(large);
    const mixed = classify({ ...large, SMA: fact('500', '5', '0.5', '6'), SMB: fact('500', '90', '15', '0') });
    expect(mixed.get('LGA')).toEqual(alone.get('LGA'));
    expect(mixed.get('LGB')).toEqual(alone.get('LGB'));
    expect(mixed.get('SMA')).toEqual({ size: 'small', style: 'value' });
  });

  it('puts a lone stock in its band in blend', () => {
    expect(classify({ ONLY: fact('5000', '15', '2', '1') }).get('ONLY')).toEqual({ size: 'mid', style: 'blend' });
  });

  it('uses whichever of the three ratios exist', () => {
    const cells = classify({
      DIVHI: fact('50000', null, null, '6'),
      DIVLO: fact('50000', null, null, '0.1'),
      ALL3: fact('50000', '20', '3', '2'),
    });
    expect(cells.get('DIVHI')?.style).toBe('value');
    expect(cells.get('DIVLO')?.style).toBe('growth');
    expect(cells.get('ALL3')?.style).toBe('blend');
  });

  it('treats P/E <= 0 and P/B < 0.05 as missing, not as cheap', () => {
    const cells = classify({
      LOSS: fact('50000', '-4', null, null),
      BOGUS: fact('50000', null, '0.001', null),
      BOTH: fact('50000', '0', '0.01', '2'),
    });
    expect(cells.has('LOSS')).toBe(false);
    expect(cells.has('BOGUS')).toBe(false);
    expect(cells.get('BOTH')).toEqual({ size: 'large', style: 'blend' });
  });

  it('leaves out stocks without a positive market cap', () => {
    const cells = classify({ NOCAP: fact(null, '10', '1', '2'), ZERO: fact('0', '10', '1', '2') });
    expect(cells.size).toBe(0);
  });

  it('breaks ties by ticker, so the result does not depend on input order', () => {
    const a = fact('50000', '15', '2', '1');
    const one = classify({ TWINA: a, TWINB: a, TWINC: a });
    const two = classify({ TWINC: a, TWINB: a, TWINA: a });
    expect([...one]).toEqual(expect.arrayContaining([...two]));
    expect(one.get('TWINA')?.style).toBe('value');
    expect(one.get('TWINC')?.style).toBe('growth');
  });
});
