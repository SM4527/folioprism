import { describe, it, expect } from 'vitest';
import { escapeCsvCell, exportFilename, intersectionCsv } from '../src/lib/csv-export';
import type { SerializedRow } from '../src/lib/engine/types';

const AAPL: SerializedRow = {
  ticker: 'AAPL',
  name: 'Apple Inc',
  portfolioPct: '3.8100',
  portfolioPctDisplay: '3.81',
  valueCents: '2556920',
  children: [
    {
      sourceTicker: 'VTI',
      sourceName: 'Vanguard Total Stock Market ETF',
      fundWeightPct: '5.3200',
      portfolioPct: '1.5800',
      portfolioPctDisplay: '1.58',
      valueCents: '1063867',
    },
    {
      sourceTicker: 'AAPL',
      sourceName: 'Direct Holding',
      fundWeightPct: '100.0000',
      portfolioPct: '2.2300',
      portfolioPctDisplay: '2.23',
      valueCents: '1493053',
    },
  ],
};

const EVIL: SerializedRow = {
  ticker: 'EVIL',
  name: '=HYPERLINK("x")',
  portfolioPct: '0.0100',
  portfolioPctDisplay: '0.01',
  valueCents: '5',
  children: [
    {
      sourceTicker: 'VTI',
      sourceName: 'Vanguard Total Stock Market ETF',
      fundWeightPct: '0.0100',
      portfolioPct: '0.0100',
      portfolioPctDisplay: '0.01',
      valueCents: '5',
    },
  ],
};

describe('escapeCsvCell', () => {
  it.each(['=SUM(A1)', '+1', '-1', '@cmd', '\tx'])('prefixes a formula start: %j', (value) => {
    expect(escapeCsvCell(value)).toBe(`'${value}`);
  });

  it('prefixes then quotes a leading CR', () => {
    expect(escapeCsvCell('\rx')).toBe('"\'\rx"');
  });

  it('leaves plain text as-is', () => {
    expect(escapeCsvCell('Apple Inc')).toBe('Apple Inc');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(escapeCsvCell('Berkshire, Inc')).toBe('"Berkshire, Inc"');
    expect(escapeCsvCell('Say "hi"')).toBe('"Say ""hi"""');
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
  });

  it('prefixes before quoting', () => {
    expect(escapeCsvCell('=A1,B1')).toBe('"\'=A1,B1"');
  });
});

describe('intersectionCsv', () => {
  it('writes the header, each parent then its sources, CRLF-terminated', () => {
    expect(intersectionCsv([AAPL])).toBe(
      [
        'level,ticker,name,fund_weight_pct,portfolio_pct,market_value',
        'stock,AAPL,Apple Inc,,3.8100,25569.20',
        'source,VTI,Vanguard Total Stock Market ETF,5.3200,1.5800,10638.67',
        'source,AAPL,Direct Holding,100.0000,2.2300,14930.53',
        '',
      ].join('\r\n'),
    );
  });

  it('escapes a formula-looking name and writes small cents as dollars', () => {
    const lines = intersectionCsv([EVIL]).split('\r\n');
    expect(lines[1]).toBe('stock,EVIL,"\'=HYPERLINK(""x"")",,0.0100,0.05');
  });

  it('writes only the header for no rows', () => {
    expect(intersectionCsv([])).toBe('level,ticker,name,fund_weight_pct,portfolio_pct,market_value\r\n');
  });
});

describe('exportFilename', () => {
  it('uses the local date', () => {
    expect(exportFilename(new Date(2026, 10, 19))).toBe('folioprism-intersection-2026-11-19.csv');
  });
});
