import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filingProblem, latestNportUrl, parseNport } from '../src/lib/refresh/nport';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseNport', () => {
  const filing = parseNport(fixture('nport-sample.xml'));

  it('reads the series and report date', () => {
    expect(filing.seriesId).toBe('S000002848');
    expect(filing.seriesName).toBe('VANGUARD TOTAL STOCK MARKET INDEX FUND');
    expect(filing.repPdDate).toBe('2026-06-30');
  });

  it('returns one holding per invstOrSec', () => {
    expect(filing.holdings).toHaveLength(5);
  });

  it('reads a CUSIP holding with its pctVal string', () => {
    expect(filing.holdings[0]).toEqual({
      name: 'Apple Inc', cusip: '037833100', isin: 'US0378331005', ticker: null,
      pctVal: '5.871626660176', assetCat: 'EC',
    });
  });

  it('reads an ISIN-only holding with a null cusip', () => {
    const h = filing.holdings[2];
    expect(h.name).toBe('Dianthus Therapeutics Inc');
    expect(h.cusip).toBeNull();
    expect(h.isin).toBe('US559CVR0225');
  });

  it('reads non-equity rows and ticker identifiers', () => {
    expect(filing.holdings[3].assetCat).toBe('STIV');
    expect(filing.holdings[3].isin).toBeNull();
    expect(filing.holdings[4]).toMatchObject({ assetCat: 'DE', ticker: 'ESU6', cusip: null, pctVal: '0.000092124293' });
  });

  it('treats a zero cusip as missing and decodes entities', () => {
    const xml = '<repPdDate>2026-06-30</repPdDate><invstOrSec><name>A &amp; B</name><cusip>000000000</cusip><pctVal>1</pctVal><assetCat>EC</assetCat></invstOrSec>';
    expect(parseNport(xml).holdings[0]).toMatchObject({ name: 'A & B', cusip: null });
  });
});

describe('latestNportUrl', () => {
  it('returns the newest NPORT-P primary_doc.xml and ignores NPORT-P/A', () => {
    expect(latestNportUrl(fixture('edgar-nport-feed.xml')))
      .toBe('https://www.sec.gov/Archives/edgar/data/36405/000003640526000480/primary_doc.xml');
  });

  it('returns null when there is no NPORT-P entry', () => {
    expect(latestNportUrl('<feed></feed>')).toBeNull();
  });
});

describe('filingProblem', () => {
  const filing = parseNport(fixture('nport-sample.xml'));

  it('accepts a dated filing', () => {
    expect(filingProblem(filing, 'S000002848')).toBeNull();
  });

  it('rejects a filing without a report date', () => {
    expect(filingProblem(parseNport('<invstOrSec><name>A</name></invstOrSec>'), 'S000002848'))
      .toBe('filing has no valid report date (missing)');
  });

  it('rejects a malformed report date', () => {
    expect(filingProblem({ ...filing, repPdDate: '06/30/2026' }, 'S000002848'))
      .toBe('filing has no valid report date (06/30/2026)');
  });

  it('rejects a filing for another series', () => {
    expect(filingProblem(filing, 'S000004317'))
      .toBe('filing is for series S000002848, expected S000004317');
  });

  it('rejects a filing without a series id', () => {
    expect(filingProblem({ ...filing, seriesId: null }, 'S000004317'))
      .toBe('filing is for series missing, expected S000004317');
  });

  it('skips the series check for a CIK-only source', () => {
    expect(filingProblem(filing, '884394')).toBeNull();
  });
});
