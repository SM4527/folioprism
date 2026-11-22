import { describe, expect, it } from 'vitest';
import { isCashLike } from '../src/lib/engine/ticker';
import { curatedAggregates, curatedStock, isCurated, mockQuote } from '../src/lib/market/mock';

describe('local data overlay (data/local.example in tests)', () => {
  it('adds local funds to the curated set with a price', () => {
    expect(isCurated('ZZBIL')).toBe(true);
    expect(curatedAggregates('ZZBIL')!.assetAllocation!.bond).toBe('99');
    expect(mockQuote('ZZBIL')!.price).toBe('50.25');
  });

  it('adds local direct-stock facts', () => {
    expect(curatedStock('ZZCO')).toMatchObject({ sector: 'technology', style: 'growth', marketCapMil: '50000' });
  });

  it('treats local money markets as cash', () => {
    expect(isCashLike('ZZMXX')).toBe(true);
  });

  it('keeps the committed curated data', () => {
    expect(isCurated('VTI')).toBe(true);
    expect(isCashLike('SPAXX')).toBe(true);
  });
});
