import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import type { StyleCellKey } from '../../src/lib/engine/prism-view/classify';
import { fundStyleBox } from '../../src/lib/engine/prism-view/fund-style';
import { styleBox } from '../../src/lib/engine/prism-view/style';
import type { FundAggregates, PrismViewInput } from '../../src/lib/engine/prism-view/types';

const cells = new Map<string, StyleCellKey>([
  ['LGV', { size: 'large', style: 'value' }],
  ['LGG', { size: 'large', style: 'growth' }],
  ['MDB', { size: 'mid', style: 'blend' }],
  ['SMV', { size: 'small', style: 'value' }],
]);

const c = (ticker: string, weightPct: string) => ({ ticker, weightPct });
const sum = (box: NonNullable<FundAggregates['styleBox']>) =>
  Decimal.sum(0, ...Object.values(box).flatMap((row) => Object.values(row))).toString();

describe('fundStyleBox', () => {
  it('matches a hand-calculated box', () => {
    const box = fundStyleBox([c('LGV', '40'), c('LGG', '30'), c('MDB', '20'), c('SMV', '10')], cells)!;
    expect(box.large).toEqual({ value: '40', blend: '0', growth: '30' });
    expect(box.mid).toEqual({ value: '0', blend: '20', growth: '0' });
    expect(box.small).toEqual({ value: '10', blend: '0', growth: '0' });
  });

  it('measures against total constituent weight, even when it is not 100', () => {
    const box = fundStyleBox([c('LGV', '49.75'), c('LGG', '49.75')], cells)!;
    expect(box.large.value).toBe('50');
    expect(sum(box)).toBe('100');
  });

  it('leaves unclassified weight out instead of scaling up', () => {
    const box = fundStyleBox([c('LGV', '50'), c('LGG', '25'), c('UNKNOWN', '25')], cells)!;
    expect(box.large.value).toBe('50');
    expect(sum(box)).toBe('75');
  });

  it('needs at least 60% classified', () => {
    expect(fundStyleBox([c('LGV', '59.9'), c('UNKNOWN', '40.1')], cells)).toBeNull();
    expect(fundStyleBox([c('LGV', '60'), c('UNKNOWN', '40')], cells)).not.toBeNull();
  });

  it('is null without constituent weight', () => {
    expect(fundStyleBox([], cells)).toBeNull();
    expect(fundStyleBox([c('LGV', '0')], cells)).toBeNull();
  });
});

describe('styleBox fallbackTickers', () => {
  const equityFund = (box: FundAggregates['styleBox']): FundAggregates => ({
    assetAllocation: { cash: '0', usStock: '100', nonUsStock: '0', bond: '0', other: '0' },
    equityPct: '100',
    sectors: null,
    regions: null,
    styleBox: box,
    valuation: { marketCapMil: '50000', pe: '20', pb: '3', ps: null, pcf: null },
    expenseRatioPct: null,
    bond: null,
  });

  it('lists equity funds without a holdings-based box, sorted', () => {
    const box = fundStyleBox([c('LGV', '100')], cells);
    const input: PrismViewInput = {
      holdings: [
        { ticker: 'ZFUND', kind: 'FUND', valueCents: '100' },
        { ticker: 'BOXED', kind: 'FUND', valueCents: '100' },
        { ticker: 'AFUND', kind: 'FUND', valueCents: '100' },
      ],
      funds: { ZFUND: equityFund(null), BOXED: equityFund(box), AFUND: equityFund(null) },
      stocks: {},
    };
    expect(styleBox(input)!.fallbackTickers).toEqual(['AFUND', 'ZFUND']);
  });
});
