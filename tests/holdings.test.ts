import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { holdingCreateSchema, holdingPatchSchema, toHoldingRow, validateAmount } from '../src/lib/holdings';

describe('toHoldingRow', () => {
  it('serializes a DOLLARS row with 2dp and no shares key', () => {
    const row = toHoldingRow({
      id: 1,
      ticker: 'VTI',
      inputMode: 'DOLLARS',
      shares: null,
      dollarAmount: new Decimal('40000.00'),
    });
    expect(row).toEqual({ id: 1, ticker: 'VTI', inputMode: 'DOLLARS', dollarAmount: '40000.00' });
    expect('shares' in row).toBe(false);
    expect(typeof row.dollarAmount).toBe('string');
  });

  it('serializes SHARES without trailing zeros and no dollarAmount key', () => {
    const row = toHoldingRow({
      id: 3,
      ticker: 'QQQ',
      inputMode: 'SHARES',
      shares: new Decimal('50.000000'),
      dollarAmount: null,
    });
    expect(row).toEqual({ id: 3, ticker: 'QQQ', inputMode: 'SHARES', shares: '50' });
    expect('dollarAmount' in row).toBe(false);
  });

  it('keeps fractional shares exact', () => {
    const row = toHoldingRow({
      id: 4,
      ticker: 'AAPL',
      inputMode: 'SHARES',
      shares: new Decimal('0.123456'),
      dollarAmount: null,
    });
    expect(row.shares).toBe('0.123456');
    expect(typeof row.shares).toBe('string');
  });
});

describe('validateAmount', () => {
  it('rejects empty, non-numeric and non-positive amounts', () => {
    expect(validateAmount('SHARES', '')).toBe('Enter an amount');
    expect(validateAmount('DOLLARS', 'abc')).toBe('Enter an amount');
    expect(validateAmount('DOLLARS', '0')).toBe('Must be more than 0');
    expect(validateAmount('DOLLARS', '-5')).toBe('Must be more than 0');
  });

  it('limits decimals per mode', () => {
    expect(validateAmount('SHARES', '1.1234567')).toBe('Max 6 decimals');
    expect(validateAmount('DOLLARS', '10.123')).toBe('Max 2 decimals');
  });

  it('rejects amounts that overflow the Decimal(20,6) and Decimal(20,2) columns', () => {
    expect(validateAmount('SHARES', '100000000000000')).toBe('Amount too large');
    expect(validateAmount('SHARES', '99999999999999.999999')).toBeNull();
    expect(validateAmount('DOLLARS', '1000000000000000000')).toBe('Amount too large');
    expect(validateAmount('DOLLARS', '999999999999999999.99')).toBeNull();
  });

  it('accepts valid amounts', () => {
    expect(validateAmount('SHARES', '12.5')).toBeNull();
    expect(validateAmount('DOLLARS', '40000.00')).toBeNull();
  });
});

const issue = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.error?.issues[0].message;

describe('holdingCreateSchema', () => {
  it('canonicalizes the ticker and nulls the other field', () => {
    const r = holdingCreateSchema.safeParse({ ticker: ' brk-b ', inputMode: 'SHARES', shares: '2' });
    expect(r.data).toEqual({ ticker: 'BRK.B', inputMode: 'SHARES', shares: '2', dollarAmount: null });
  });

  it('rejects malformed tickers', () => {
    for (const ticker of ['TOO-LONG-TICKER1', 'A B']) {
      const r = holdingCreateSchema.safeParse({ ticker, inputMode: 'SHARES', shares: '2' });
      expect(issue(r)).toBe('Use 1-12 letters, digits or dots');
    }
  });

  it('forces CASH to DOLLARS', () => {
    const r = holdingCreateSchema.safeParse({ ticker: 'cash', inputMode: 'SHARES', shares: '500' });
    expect(r.data).toEqual({ ticker: 'CASH', inputMode: 'DOLLARS', shares: null, dollarAmount: '500' });
  });

  it('forces a SHARES money market to DOLLARS at $1.00 NAV', () => {
    const r = holdingCreateSchema.safeParse({ ticker: 'VMFXX', inputMode: 'SHARES', shares: '1500' });
    expect(r.data).toEqual({ ticker: 'VMFXX', inputMode: 'DOLLARS', shares: null, dollarAmount: '1500' });
  });

  it('accepts a bare lowercase cash ticker as DOLLARS', () => {
    const r = holdingCreateSchema.safeParse({ ticker: 'cash', inputMode: 'DOLLARS', dollarAmount: '25.50' });
    expect(r.data).toEqual({ ticker: 'CASH', inputMode: 'DOLLARS', shares: null, dollarAmount: '25.50' });
  });

  it('requires the field that matches the mode', () => {
    const r = holdingCreateSchema.safeParse({ ticker: 'VTI', inputMode: 'DOLLARS', shares: '5' });
    expect(issue(r)).toBe('Enter an amount');
  });
});

describe('holdingPatchSchema', () => {
  it('switches mode and clears the other field', () => {
    const r = holdingPatchSchema('QQQ').safeParse({ inputMode: 'DOLLARS', dollarAmount: '1200.50' });
    expect(r.data).toEqual({ inputMode: 'DOLLARS', shares: null, dollarAmount: '1200.50' });
  });

  it('keeps CASH in DOLLARS', () => {
    const r = holdingPatchSchema('CASH').safeParse({ inputMode: 'SHARES', shares: '10' });
    expect(r.data).toEqual({ inputMode: 'DOLLARS', shares: null, dollarAmount: '10' });
  });

  it('reports amount errors', () => {
    const r = holdingPatchSchema('VTI').safeParse({ inputMode: 'DOLLARS', dollarAmount: '1.123' });
    expect(issue(r)).toBe('Max 2 decimals');
  });
});
