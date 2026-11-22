import { describe, it, expect } from 'vitest';
import { canonicalTicker, groupTicker, isCashLike } from '../../src/lib/engine/ticker';

describe('canonicalTicker', () => {
  it('trims, uppercases and maps - and / to .', () => {
    expect(canonicalTicker(' brk-b ')).toBe('BRK.B');
    expect(canonicalTicker('BRK/B')).toBe('BRK.B');
    expect(canonicalTicker('vti')).toBe('VTI');
  });
});

describe('groupTicker', () => {
  it('maps share classes only when merging', () => {
    expect(groupTicker('GOOG', true)).toBe('GOOGL');
    expect(groupTicker('BRK.A', true)).toBe('BRK.B');
    expect(groupTicker('GOOG', false)).toBe('GOOG');
    expect(groupTicker('AAPL', true)).toBe('AAPL');
  });
});

describe('isCashLike', () => {
  it('treats CASH and money-market tickers as cash', () => {
    expect(isCashLike('CASH')).toBe(true);
    expect(isCashLike('SPAXX')).toBe(true);
    expect(isCashLike('VTI')).toBe(false);
  });

  it('covers CASH in any case and the $1.00 NAV money markets, not ETFs', () => {
    for (const t of ['cash', 'Cash', 'CASH']) expect(isCashLike(canonicalTicker(t))).toBe(true);
    for (const t of ['VMFXX', 'SPAXX', 'FDRXX', 'SWVXX', 'SPRXX']) {
      expect(isCashLike(t)).toBe(true);
    }
    for (const t of ['VTI', 'BND']) expect(isCashLike(t)).toBe(false);
  });
});
