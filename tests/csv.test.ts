import { describe, it, expect } from 'vitest';
import { parseHoldingsCsv } from '../src/lib/csv';

describe('parseHoldingsCsv', () => {
  it('parses a ticker,amount file as DOLLARS', () => {
    expect(parseHoldingsCsv('ticker,amount\nVTI,40000\n')).toEqual({
      rows: [{ ticker: 'VTI', inputMode: 'DOLLARS', dollarAmount: '40000', line: 2 }],
      skipped: [],
    });
  });

  it('parses a ticker,shares file as SHARES and canonicalizes the ticker', () => {
    expect(parseHoldingsCsv('ticker,shares\nqqq,50')).toEqual({
      rows: [{ ticker: 'QQQ', inputMode: 'SHARES', shares: '50', line: 2 }],
      skipped: [],
    });
  });

  it('treats a BOM and CRLF like plain input', () => {
    const plain = parseHoldingsCsv('ticker,amount\nVTI,40000\nQQQ,100\n');
    expect(parseHoldingsCsv('﻿ticker,amount\r\nVTI,40000\r\nQQQ,100\r\n')).toEqual(plain);
  });

  it('maps broker headers in any case and prefers SHARES when both are set', () => {
    const text = 'SYMBOL,Description,quantity,Current Value\nAAPL,Apple Inc,10,"$2,000.00"\nVXUS,Intl,,500';
    expect(parseHoldingsCsv(text)).toEqual({
      rows: [
        { ticker: 'AAPL', inputMode: 'SHARES', shares: '10', line: 2 },
        { ticker: 'VXUS', inputMode: 'DOLLARS', dollarAmount: '500', line: 3 },
      ],
      skipped: [],
    });
  });

  it('cleans quoted dollar and thousands-comma amounts', () => {
    const text = 'symbol,shares,amount\nVXUS,,"$1,234.50"\nVTI,"1,000",';
    expect(parseHoldingsCsv(text)).toEqual({
      rows: [
        { ticker: 'VXUS', inputMode: 'DOLLARS', dollarAmount: '1234.50', line: 2 },
        { ticker: 'VTI', inputMode: 'SHARES', shares: '1000', line: 3 },
      ],
      skipped: [],
    });
  });

  it('skips footer rows as Invalid ticker with file line numbers', () => {
    const text = [
      'Account,Symbol,Quantity',
      'Joint,VTI,5',
      'Joint,Pending Activity,',
      'Total,,',
      'Joint,Total,10',
      'Joint,TOTALS,10',
    ].join('\n');
    expect(parseHoldingsCsv(text)).toEqual({
      rows: [{ ticker: 'VTI', inputMode: 'SHARES', shares: '5', line: 2 }],
      skipped: [
        { line: 3, reason: 'Invalid ticker' },
        { line: 4, reason: 'Invalid ticker' },
        { line: 5, reason: 'Invalid ticker' },
        { line: 6, reason: 'Invalid ticker' },
      ],
    });
  });

  it('ignores blank lines without reporting them', () => {
    expect(parseHoldingsCsv('ticker,amount\n\nVTI,10\n   \n')).toEqual({
      rows: [{ ticker: 'VTI', inputMode: 'DOLLARS', dollarAmount: '10', line: 3 }],
      skipped: [],
    });
  });

  it('skips zero, negative and parenthesized amounts', () => {
    const result = parseHoldingsCsv('ticker,amount\nVTI,0\nQQQ,-5\nBND,(5.00)');
    expect(result).toEqual({
      rows: [],
      skipped: [
        { line: 2, reason: 'Must be more than 0' },
        { line: 3, reason: 'Must be more than 0' },
        { line: 4, reason: 'Must be more than 0' },
      ],
    });
  });

  it('reports non-numeric amounts and too many dollar decimals', () => {
    expect(parseHoldingsCsv('ticker,amount\nVTI,abc\nQQQ,1.005')).toEqual({
      rows: [],
      skipped: [
        { line: 2, reason: 'Enter an amount' },
        { line: 3, reason: 'Max 2 decimals' },
      ],
    });
  });

  it('strips Fidelity-style trailing asterisks', () => {
    expect(parseHoldingsCsv('symbol,current value\nSPAXX**,250.00')).toEqual({
      rows: [{ ticker: 'SPAXX', inputMode: 'DOLLARS', dollarAmount: '250.00', line: 2 }],
      skipped: [],
    });
  });

  it('sums a ticker that appears twice in the same mode', () => {
    expect(parseHoldingsCsv('ticker,amount\nVTI,100\nQQQ,1\nvti,50.25')).toEqual({
      rows: [
        { ticker: 'VTI', inputMode: 'DOLLARS', dollarAmount: '150.25', line: 2 },
        { ticker: 'QQQ', inputMode: 'DOLLARS', dollarAmount: '1', line: 3 },
      ],
      skipped: [],
    });
  });

  it('falls back to the dollars column when the shares cell is a placeholder', () => {
    expect(parseHoldingsCsv('symbol,quantity,market value\nSPAXX,--,"$500.00"\nVTI,n/a,')).toEqual({
      rows: [{ ticker: 'SPAXX', inputMode: 'DOLLARS', dollarAmount: '500.00', line: 2 }],
      skipped: [{ line: 3, reason: 'Enter an amount' }],
    });
  });

  it('reports a non-numeric shares cell when there is no dollars column', () => {
    expect(parseHoldingsCsv('ticker,shares\nVTI,n/a')).toEqual({
      rows: [],
      skipped: [{ line: 2, reason: 'Enter an amount' }],
    });
  });

  it('merges a non-cash ticker with mixed modes into dollars plus pending shares', () => {
    expect(parseHoldingsCsv('ticker,shares,amount\nVTI,2,\nVTI,,100\nVTI,1.5,')).toEqual({
      rows: [{ ticker: 'VTI', inputMode: 'DOLLARS', dollarAmount: '100', pendingShares: '3.5', line: 2 }],
      skipped: [],
    });
  });

  it('sums money-market rows across accounts as dollars, shares counting at $1.00', () => {
    const text = 'Account,Symbol,Quantity,Current Value\nA,SPAXX,1000,\nB,SPAXX,,$500.25\n';
    expect(parseHoldingsCsv(text)).toEqual({
      rows: [{ ticker: 'SPAXX', inputMode: 'DOLLARS', dollarAmount: '1500.25', line: 2 }],
      skipped: [],
    });
  });

  it('sums share rows of one ticker across accounts', () => {
    expect(parseHoldingsCsv('symbol,quantity\nBND,10\nBND,2.5\nbnd,7')).toEqual({
      rows: [{ ticker: 'BND', inputMode: 'SHARES', shares: '19.5', line: 2 }],
      skipped: [],
    });
  });

  it('returns an error when no header row is found', () => {
    expect(parseHoldingsCsv('foo,bar\n1,2')).toEqual({
      error: 'No header row with a ticker column and an amount or shares column',
    });
  });

  it('ignores broker preamble lines before the header', () => {
    const text = 'Brokerage export\nAs of 11/18/2026,\nSymbol,Quantity\nNVDA,3';
    expect(parseHoldingsCsv(text)).toEqual({
      rows: [{ ticker: 'NVDA', inputMode: 'SHARES', shares: '3', line: 4 }],
      skipped: [],
    });
  });

  it('handles escaped quotes inside quoted cells', () => {
    expect(parseHoldingsCsv('ticker,name,amount\nVTI,"Vanguard ""Total"", ETF",10')).toEqual({
      rows: [{ ticker: 'VTI', inputMode: 'DOLLARS', dollarAmount: '10', line: 2 }],
      skipped: [],
    });
  });
});
