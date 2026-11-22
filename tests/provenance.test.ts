import { describe, expect, it } from 'vitest';
import type { CoverageItem } from '../src/lib/analysis';
import { asOfTitle, isStale, linkable, sourceLabel, STALE_DAYS } from '../src/lib/provenance';

const SEC = 'https://www.sec.gov/Archives/edgar/data/36405/primary_doc.xml';

function item(extra: Partial<CoverageItem> = {}): CoverageItem {
  return {
    ticker: 'VTI',
    coveredPct: '100.0000',
    source: 'curated',
    unavailable: false,
    sourceUrl: null,
    holdingsAsOf: null,
    asOfOrigin: null,
    curated: false,
    ...extra,
  };
}

describe('sourceLabel', () => {
  it('labels unavailable, imported and live Yahoo funds', () => {
    expect(sourceLabel(item({ source: 'yahoo-top10', unavailable: true }))).toBe('Unavailable');
    expect(sourceLabel(item({ source: 'imported' }))).toBe('Imported CSV');
    expect(sourceLabel(item({ source: 'yahoo-top10' }))).toBe('Yahoo top 10');
  });

  it('labels curated funds by their source URL host', () => {
    expect(sourceLabel(item({ sourceUrl: SEC }))).toBe('SEC N-PORT');
    expect(sourceLabel(item({ sourceUrl: 'https://query2.finance.yahoo.com/v10/finance/quoteSummary' }))).toBe('Yahoo top 10');
    expect(sourceLabel(item({ sourceUrl: 'https://www.invesco.com/us/qqq' }))).toBe('Issuer file');
    expect(sourceLabel(item())).toBe('Curated');
  });
});

describe('asOfTitle', () => {
  it('says where the date came from', () => {
    expect(asOfTitle(item({ holdingsAsOf: '2026-06-30', asOfOrigin: 'curated' }))).toBe('Holdings date recorded with the curated data');
    expect(asOfTitle(item({ source: 'imported', holdingsAsOf: '2026-11-18', asOfOrigin: 'file' }))).toBe('Holdings date from the imported file');
    expect(asOfTitle(item({ source: 'imported', holdingsAsOf: '2026-11-20', asOfOrigin: 'upload' }))).toBe('Upload date. The file had no holdings date');
    expect(asOfTitle(item({ source: 'yahoo-top10' }))).toBe('Yahoo does not publish a holdings date');
  });

  it('has no title for an unavailable fund or a curated fund with no date', () => {
    expect(asOfTitle(item({ source: 'yahoo-top10', unavailable: true }))).toBeUndefined();
    expect(asOfTitle(item({ asOfOrigin: 'curated' }))).toBeUndefined();
  });
});

describe('isStale', () => {
  const now = new Date('2026-11-20T12:00:00Z');

  it('flags holdings more than 180 days old', () => {
    expect(STALE_DAYS).toBe(180);
    expect(isStale('2026-05-01', now)).toBe(true);
    expect(isStale('2026-06-30', now)).toBe(false);
    expect(isStale(null, now)).toBe(false);
  });

  it('is strictly more than 180 days', () => {
    expect(isStale('2026-05-24', new Date('2026-11-20T00:00:00Z'))).toBe(false);
    expect(isStale('2026-05-23', new Date('2026-11-20T00:00:00Z'))).toBe(true);
  });
});

describe('linkable', () => {
  it('links only curated sources with a URL', () => {
    expect(linkable(item({ sourceUrl: SEC }))).toBe(true);
    expect(linkable(item())).toBe(false);
    expect(linkable(item({ source: 'imported', sourceUrl: SEC }))).toBe(false);
  });
});
