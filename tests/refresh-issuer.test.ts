import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { keptSnapshotBlocks } from '../src/lib/refresh/constituents';
import { issuerConstituents } from '../src/lib/refresh/issuer';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const DATED = 'Fund Holdings as of,"Dec 31, 2025"\n \nTicker,Name,Weight (%)\n';

describe('issuerConstituents', () => {
  it('builds sorted 4dp constituents with known names and the file date', () => {
    const result = issuerConstituents(fixture('issuer-ishares.csv'), { AAPL: 'Apple Inc' });
    if ('skip' in result) throw new Error(result.skip);
    expect(result.asOf).toBe('2025-12-31');
    expect(result.sumPct).toBe('24.3100');
    expect(result.constituents.map((c) => c.ticker)).toEqual(['NVDA', 'AAPL', 'MSFT', 'AMZN', 'BRK.B', 'JPM']);
    expect(result.constituents[0]).toEqual({ ticker: 'NVDA', name: 'NVIDIA CORP', weightPct: 6.51 });
    expect(result.constituents[1].name).toBe('Apple Inc');
  });

  it('rounds half-even to 4dp, drops zero results and breaks weight ties by ticker', () => {
    const result = issuerConstituents(`${DATED}MSFT,Microsoft,1.00005\nAAPL,Apple,1.00015\nZZ,Zed,0.00004\nAB,Ab,1.0002\n`, {});
    if ('skip' in result) throw new Error(result.skip);
    expect(result.constituents).toEqual([
      { ticker: 'AAPL', name: 'Apple', weightPct: 1.0002 },
      { ticker: 'AB', name: 'Ab', weightPct: 1.0002 },
      { ticker: 'MSFT', name: 'Microsoft', weightPct: 1 },
    ]);
  });

  it('skips a file without a holdings date', () => {
    expect(issuerConstituents(fixture('issuer-plain.csv'), {})).toEqual({ skip: 'issuer file has no holdings date' });
  });

  it('skips with the parser error', () => {
    expect(issuerConstituents('a,b\n1,2\n', {})).toEqual({ skip: 'no header row with a ticker column and a weight column' });
  });

  it('skips a list whose weights sum above 100', () => {
    expect(issuerConstituents(`${DATED}AAPL,Apple,60\nMSFT,Microsoft,40.2\n`, {})).toEqual({
      skip: 'weights sum to 100.2%, above 100%',
    });
  });
});

describe('issuer list against the kept snapshot', () => {
  const result = issuerConstituents(fixture('issuer-ishares.csv'), {});
  const asOf = 'skip' in result ? '' : result.asOf;

  it('replaces a newer Yahoo top-10 stub with the older full issuer list', () => {
    const stub = { holdingsSource: 'https://query2.finance.yahoo.com/v10/finance/quoteSummary', holdingsAsOf: '2026-11-20T00:00:00Z' };
    expect(asOf).toBe('2025-12-31');
    expect(keptSnapshotBlocks(stub, asOf)).toBe(false);
  });

  it('keeps a newer full issuer snapshot', () => {
    const kept = { holdingsSource: 'https://www.invesco.com/us/financial-products/etfs/product-detail?ticker=QQQ', holdingsAsOf: '2026-11-18T00:00:00Z' };
    expect(keptSnapshotBlocks(kept, asOf)).toBe(true);
  });
});
