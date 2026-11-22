import { describe, it, expect, vi } from 'vitest';
import type { FundHoldings } from '../src/lib/market/types';

vi.mock('../src/lib/db', () => ({ prisma: {} }));
const { withImport } = await import('../src/lib/fund-imports');

const imported = [{ ticker: 'AAPL', name: 'Apple Inc', weightPct: '7.1' }];
const aggregates = { equityPct: '100' } as unknown as FundHoldings['aggregates'];

const curated: FundHoldings = {
  name: 'Schwab US Dividend Equity ETF',
  source: 'curated',
  constituents: [{ ticker: 'KO', name: 'Coca-Cola', weightPct: '4' }],
  aggregates,
  provenance: { url: 'https://www.sec.gov/x', asOf: '2026-06-30', asOfOrigin: 'curated', curated: true },
};

const unavailable: FundHoldings = { name: 'VEA', source: 'yahoo-top10', constituents: [], aggregates: null, unavailable: true };

describe('withImport', () => {
  it('replaces a curated fund constituents and keeps its name and aggregates', () => {
    expect(withImport(curated, { constituents: imported, holdingsAsOf: '2025-12-31', asOfFromFile: true })).toEqual({
      name: 'Schwab US Dividend Equity ETF',
      source: 'imported',
      constituents: imported,
      aggregates,
      unavailable: false,
      provenance: { url: null, asOf: '2025-12-31', asOfOrigin: 'file', curated: true },
    });
  });

  it('clears unavailable on a failed Yahoo fund and marks an upload date', () => {
    expect(withImport(unavailable, { constituents: imported, holdingsAsOf: '2026-11-20', asOfFromFile: false })).toEqual({
      name: 'VEA',
      source: 'imported',
      constituents: imported,
      aggregates: null,
      unavailable: false,
      provenance: { url: null, asOf: '2026-11-20', asOfOrigin: 'upload', curated: false },
    });
  });
});
