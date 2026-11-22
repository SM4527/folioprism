import { describe, it, expect } from 'vitest';
import {
  COUNTRY_REGION,
  REGION_GROUPS,
  SECTOR_BY_NAME,
  SECTORS,
  SUB_REGIONS,
  SUPER_SECTORS,
  YAHOO_SECTOR_KEYS,
  isUsCountry,
} from '../../src/lib/engine/taxonomy';

describe('sectors', () => {
  it('lists the 11 sectors in table order', () => {
    expect(SECTORS).toEqual([
      'basicMaterials',
      'consumerCyclical',
      'financialServices',
      'realEstate',
      'communicationServices',
      'energy',
      'industrials',
      'technology',
      'consumerDefensive',
      'healthcare',
      'utilities',
    ]);
  });

  it('groups them into 3 super-sectors that concatenate to SECTORS', () => {
    expect(SUPER_SECTORS.cyclical).toEqual(['basicMaterials', 'consumerCyclical', 'financialServices', 'realEstate']);
    expect(SUPER_SECTORS.sensitive).toEqual(['communicationServices', 'energy', 'industrials', 'technology']);
    expect(SUPER_SECTORS.defensive).toEqual(['consumerDefensive', 'healthcare', 'utilities']);
    expect([...SUPER_SECTORS.cyclical, ...SUPER_SECTORS.sensitive, ...SUPER_SECTORS.defensive]).toEqual(SECTORS);
  });

  it('maps every Yahoo sectorWeightings key to a sector', () => {
    const keys = [
      'realestate',
      'consumer_cyclical',
      'basic_materials',
      'consumer_defensive',
      'technology',
      'communication_services',
      'financial_services',
      'utilities',
      'industrials',
      'energy',
      'healthcare',
    ];
    expect(new Set(keys.map((k) => YAHOO_SECTOR_KEYS[k]))).toEqual(new Set(SECTORS));
    expect(YAHOO_SECTOR_KEYS.realestate).toBe('realEstate');
  });

  it('maps every assetProfile sector name to a sector', () => {
    const names = [
      'Basic Materials',
      'Consumer Cyclical',
      'Financial Services',
      'Real Estate',
      'Communication Services',
      'Energy',
      'Industrials',
      'Technology',
      'Consumer Defensive',
      'Healthcare',
      'Utilities',
    ];
    expect(names.map((n) => SECTOR_BY_NAME[n])).toEqual(SECTORS);
  });
});

describe('regions', () => {
  it('lists the 10 sub-regions in 3 groups', () => {
    expect(SUB_REGIONS).toEqual([
      'northAmerica',
      'latinAmerica',
      'unitedKingdom',
      'europeDeveloped',
      'europeEmerging',
      'africaMiddleEast',
      'japan',
      'australasia',
      'asiaDeveloped',
      'asiaEmerging',
    ]);
    expect(REGION_GROUPS.americas).toEqual(SUB_REGIONS.slice(0, 2));
    expect(REGION_GROUPS.greaterEurope).toEqual(SUB_REGIONS.slice(2, 6));
    expect(REGION_GROUPS.greaterAsia).toEqual(SUB_REGIONS.slice(6));
  });

  it('maps countries by name and ISO code', () => {
    expect(COUNTRY_REGION['United States']).toBe('northAmerica');
    expect(COUNTRY_REGION.US).toBe('northAmerica');
    expect(COUNTRY_REGION['United Kingdom']).toBe('unitedKingdom');
    expect(COUNTRY_REGION.Japan).toBe('japan');
    expect(COUNTRY_REGION.Taiwan).toBe('asiaDeveloped');
    expect(COUNTRY_REGION.China).toBe('asiaEmerging');
    expect(COUNTRY_REGION.Ireland).toBe('europeDeveloped');
    expect(COUNTRY_REGION.Switzerland).toBe('europeDeveloped');
    expect(COUNTRY_REGION.Israel).toBe('africaMiddleEast');
  });

  it('maps every issuer country in the curated N-PORT data', () => {
    const codes = ['US', 'IE', 'CH', 'BM', 'KY', 'CW', 'NL', 'LR', 'SG', 'JE', 'GB', 'CA', 'PR', 'MH', 'VG', 'BS', 'LU', 'DK'];
    for (const code of codes) expect(SUB_REGIONS).toContain(COUNTRY_REGION[code]);
  });

  it('maps the home countries of common US-listed non-US issuers', () => {
    expect(COUNTRY_REGION.Uruguay).toBe('latinAmerica');
    expect(COUNTRY_REGION.Panama).toBe('latinAmerica');
    expect(COUNTRY_REGION.Kazakhstan).toBe('europeEmerging');
    expect(COUNTRY_REGION.Russia).toBe('europeEmerging');
    expect(COUNTRY_REGION.Cyprus).toBe('europeEmerging');
    expect(COUNTRY_REGION.Monaco).toBe('europeDeveloped');
    expect(COUNTRY_REGION.Iceland).toBe('europeDeveloped');
    expect(COUNTRY_REGION['Isle of Man']).toBe('unitedKingdom');
    expect(COUNTRY_REGION.Macau).toBe('asiaDeveloped');
    expect(COUNTRY_REGION.Vietnam).toBe('asiaEmerging');
  });

  it('maps every country to a sub-region key', () => {
    for (const region of Object.values(COUNTRY_REGION)) expect(SUB_REGIONS).toContain(region);
  });
});

describe('isUsCountry', () => {
  it('is true only for the United States', () => {
    expect(isUsCountry('United States')).toBe(true);
    expect(isUsCountry('US')).toBe(true);
    expect(isUsCountry('Canada')).toBe(false);
    expect(isUsCountry(null)).toBe(false);
  });
});
