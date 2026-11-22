import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseFundHoldingsCsv, MAX_SUM_PCT } from '../src/lib/fund-csv';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseFundHoldingsCsv', () => {
  it('parses an iShares file to equity rows with its as-of date', () => {
    const result = parseFundHoldingsCsv(fixture('issuer-ishares.csv'));
    expect(result).toEqual({
      constituents: [
        { ticker: 'NVDA', name: 'NVIDIA CORP', weightPct: '6.51' },
        { ticker: 'AAPL', name: 'APPLE INC', weightPct: '6.02' },
        { ticker: 'MSFT', name: 'MICROSOFT CORP', weightPct: '5.4' },
        { ticker: 'AMZN', name: 'AMAZON COM INC', weightPct: '3.55' },
        { ticker: 'BRK.B', name: 'BERKSHIRE HATHAWAY INC CLASS B', weightPct: '1.48' },
        { ticker: 'JPM', name: 'JPMORGAN CHASE & CO', weightPct: '1.35' },
      ],
      skipped: [],
      asOf: '2025-12-31',
      sumPct: '24.31',
    });
  });

  it('parses a plain file: sums duplicates, skips blank and cash tickers, no date', () => {
    expect(parseFundHoldingsCsv(fixture('issuer-plain.csv'))).toEqual({
      constituents: [
        { ticker: 'AAPL', name: 'Apple Inc', weightPct: '8' },
        { ticker: 'MSFT', name: 'Microsoft Corp', weightPct: '6.5' },
        { ticker: 'NVDA', name: 'NVIDIA Corp', weightPct: '6.1' },
        { ticker: 'GOOGL', name: 'Alphabet Inc Class A', weightPct: '2' },
        { ticker: 'META', name: 'META', weightPct: '2.3' },
      ],
      skipped: [
        { line: 6, reason: 'missing ticker' },
        { line: 8, reason: 'cash is not a stock' },
      ],
      asOf: null,
      sumPct: '24.9',
    });
  });

  it('aliases BFB to BF.B and canonicalizes BRK-B', () => {
    const result = parseFundHoldingsCsv('symbol,weight\nBFB,1\nbrk-b,2');
    expect(result).toMatchObject({ constituents: [{ ticker: 'BF.B' }, { ticker: 'BRK.B' }] });
  });

  it('rejects a file without a ticker and weight header', () => {
    expect(parseFundHoldingsCsv(fixture('broker-export.csv'))).toEqual({
      error: 'no header row with a ticker column and a weight column',
    });
  });

  it('rejects weights summing above 100%', () => {
    expect(parseFundHoldingsCsv('ticker,weight\nAAPL,91.2\nMSFT,91.2')).toEqual({ error: 'weights sum to 182.4%, above 100%' });
  });

  it('rejects a sum of 100.3, matching the refresh path', () => {
    expect(MAX_SUM_PCT).toBe(100);
    expect(parseFundHoldingsCsv('ticker,weight\nAAPL,60.3\nMSFT,40')).toEqual({ error: 'weights sum to 100.3%, above 100%' });
  });

  it('accepts a sum of exactly 100', () => {
    const result = parseFundHoldingsCsv('ticker,weight\nAAPL,60\nMSFT,40');
    expect(result).toMatchObject({ sumPct: '100', constituents: [{ weightPct: '60' }, { weightPct: '40' }] });
  });

  it('rejects a header with no valid rows', () => {
    expect(parseFundHoldingsCsv('ticker,weight\n,5\nAAPL,abc')).toEqual({ error: 'no rows with a ticker and a weight' });
  });

  it('skips bad weights and tickers with 1-based line numbers', () => {
    const text = 'ticker,% of net assets\nAAPL,0\nMSFT,-1\nNVDA,abc\nAMZN,100.1\nBAD TICKER!,1\nJPM,"1,0"\nV," 2.5 %"';
    expect(parseFundHoldingsCsv(text)).toEqual({
      constituents: [{ ticker: 'V', name: 'V', weightPct: '2.5' }],
      skipped: [
        { line: 2, reason: 'weight must be above 0 and at most 100' },
        { line: 3, reason: 'weight must be above 0 and at most 100' },
        { line: 4, reason: 'weight is not a number' },
        { line: 5, reason: 'weight must be above 0 and at most 100' },
        { line: 6, reason: 'invalid ticker' },
        { line: 7, reason: 'weight is not a number' },
      ],
      asOf: null,
      sumPct: '2.5',
    });
  });

  it.each(['2026-11-18', '11/18/2026', 'Nov 18, 2026', 'November 18, 2026'])('parses the preamble date %s', (date) => {
    const result = parseFundHoldingsCsv(`Holdings as of ${date}\nticker,weight\nAAPL,5`);
    expect(result).toMatchObject({ asOf: '2026-11-18' });
  });

  it('reads the as-of date from a date column on the first data row', () => {
    const result = parseFundHoldingsCsv('Date,Ticker,Weighting\n11/18/2026,AAPL,5\n11/18/2026,MSFT,4');
    expect(result).toMatchObject({ asOf: '2026-11-18', sumPct: '9' });
  });

  it('ignores an impossible date', () => {
    expect(parseFundHoldingsCsv('as of,2026-02-30\nticker,weight\nAAPL,5')).toMatchObject({ asOf: null });
  });
});
