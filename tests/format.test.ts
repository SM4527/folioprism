import { describe, expect, it } from 'vitest';
import {
  centsToDollars,
  formatAsOf,
  formatAsOfDate,
  formatAsOfDateTime,
  formatCents,
  formatExpensePct,
  formatHoldingsDate,
  formatMarketCapMil,
  formatRatio,
  formatYears,
  stocksLabel,
  unpricedNote,
} from '../src/lib/format';

describe('cents formatting', () => {
  it('converts cents strings to dollar strings without floats', () => {
    expect(centsToDollars('5')).toBe('0.05');
    expect(centsToDollars('2556920')).toBe('25569.20');
  });

  it('formats cents as USD', () => {
    expect(formatCents('4000000')).toBe('$40,000.00');
    expect(formatCents('5')).toBe('$0.05');
    expect(formatCents('123456789')).toBe('$1,234,567.89');
  });
});

describe('as-of formatting', () => {
  const iso = '2026-11-18T21:00:00Z';

  it('shows the New York time for today', () => {
    expect(formatAsOf(iso, new Date('2026-11-18T22:00:00Z'))).toBe('4:00 PM ET');
  });

  it('shows the date for older data this year', () => {
    expect(formatAsOf(iso, new Date('2026-11-20T12:00:00Z'))).toBe('Nov 18');
  });

  it('shows the year for data from a previous year', () => {
    expect(formatAsOf('2025-11-17T21:00:00Z', new Date('2026-11-20T12:00:00Z'))).toBe('Nov 17, 2025');
  });

  it('formats tooltip date-times and dates', () => {
    expect(formatAsOfDateTime('2026-11-17T21:00:00Z')).toBe('Nov 17, 4:00 PM ET');
    expect(formatAsOfDate('2026-11-14T21:00:00Z')).toBe('Nov 14, 2026');
  });
});

describe('stocksLabel', () => {
  it('pluralizes on the total', () => {
    expect(stocksLabel(3, 50)).toBe('3 of 50 stocks');
    expect(stocksLabel(1, 1)).toBe('1 of 1 stock');
  });
});

describe('unpricedNote', () => {
  it('is null when every holding is priced', () => {
    expect(unpricedNote([])).toBeNull();
  });

  it('counts the holdings left out of the total', () => {
    expect(unpricedNote(['ZZZZZQ'])).toBe('1 holding could not be priced and is excluded from the total');
    expect(unpricedNote(['A', 'B'])).toBe('2 holdings could not be priced and are excluded from the total');
  });
});

describe('Prism View number formatting', () => {
  it('formats market cap, ratios, expense ratios and years', () => {
    expect(formatMarketCapMil('210431.4')).toBe('$210,431');
    expect(formatRatio('24.126')).toBe('24.13');
    expect(formatExpensePct('0.0345')).toBe('0.03%');
    expect(formatYears('6.1234')).toBe('6.12 yrs');
  });

  it('prints a dash for missing values', () => {
    for (const f of [formatMarketCapMil, formatRatio, formatExpensePct, formatYears]) expect(f(null)).toBe('—');
  });
});

describe('formatHoldingsDate', () => {
  it('formats a holdings date in UTC, or a dash for null', () => {
    expect(formatHoldingsDate('2026-06-30')).toBe('Jun 30, 2026');
    expect(formatHoldingsDate('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatHoldingsDate(null)).toBe('—');
  });
});
