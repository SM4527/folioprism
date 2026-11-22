/** Asset allocation rows in table order (D-07). */
export const ALLOCATION_KEYS = ['cash', 'usStock', 'nonUsStock', 'bond', 'other'] as const;
export type AllocationKey = (typeof ALLOCATION_KEYS)[number];

/** The 11 equity sectors in table order (D-06). */
export const SECTORS = [
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
] as const;
export type SectorKey = (typeof SECTORS)[number];

export type SuperSectorKey = 'cyclical' | 'sensitive' | 'defensive';

/** The 3 super-sectors and their sectors (D-06, PLAN.md). */
export const SUPER_SECTORS: Record<SuperSectorKey, readonly SectorKey[]> = {
  cyclical: ['basicMaterials', 'consumerCyclical', 'financialServices', 'realEstate'],
  sensitive: ['communicationServices', 'energy', 'industrials', 'technology'],
  defensive: ['consumerDefensive', 'healthcare', 'utilities'],
};

/** Yahoo `topHoldings.sectorWeightings` keys to sector keys (D-06). */
export const YAHOO_SECTOR_KEYS: Record<string, SectorKey> = {
  basic_materials: 'basicMaterials',
  consumer_cyclical: 'consumerCyclical',
  financial_services: 'financialServices',
  realestate: 'realEstate',
  communication_services: 'communicationServices',
  energy: 'energy',
  industrials: 'industrials',
  technology: 'technology',
  consumer_defensive: 'consumerDefensive',
  healthcare: 'healthcare',
  utilities: 'utilities',
};

/** Yahoo `assetProfile.sector` names to sector keys (D-05, D-06). */
export const SECTOR_BY_NAME: Record<string, SectorKey> = {
  'Basic Materials': 'basicMaterials',
  'Consumer Cyclical': 'consumerCyclical',
  'Financial Services': 'financialServices',
  'Real Estate': 'realEstate',
  'Communication Services': 'communicationServices',
  Energy: 'energy',
  Industrials: 'industrials',
  Technology: 'technology',
  'Consumer Defensive': 'consumerDefensive',
  Healthcare: 'healthcare',
  Utilities: 'utilities',
};

/** The 10 world sub-regions in table order (D-06). */
export const SUB_REGIONS = [
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
] as const;
export type SubRegionKey = (typeof SUB_REGIONS)[number];

export type RegionGroupKey = 'americas' | 'greaterEurope' | 'greaterAsia';

/** The 3 region groups and their sub-regions (D-06, PLAN.md). */
export const REGION_GROUPS: Record<RegionGroupKey, readonly SubRegionKey[]> = {
  americas: ['northAmerica', 'latinAmerica'],
  greaterEurope: ['unitedKingdom', 'europeDeveloped', 'europeEmerging', 'africaMiddleEast'],
  greaterAsia: ['japan', 'australasia', 'asiaDeveloped', 'asiaEmerging'],
};

/**
 * [Yahoo country name, ISO-3166 alpha-2] pairs per sub-region. Offshore registries of
 * US-listed issuers (Bermuda, Cayman, BVI, Bahamas, Curacao, Liberia, Marshall Islands) count as North America.
 */
const COUNTRIES: Record<SubRegionKey, [string, string][]> = {
  northAmerica: [
    ['United States', 'US'], ['Canada', 'CA'], ['Puerto Rico', 'PR'], ['Bermuda', 'BM'], ['Cayman Islands', 'KY'],
    ['British Virgin Islands', 'VG'], ['Bahamas', 'BS'], ['Curacao', 'CW'], ['Liberia', 'LR'], ['Marshall Islands', 'MH'],
  ],
  latinAmerica: [
    ['Mexico', 'MX'], ['Brazil', 'BR'], ['Chile', 'CL'], ['Argentina', 'AR'], ['Colombia', 'CO'], ['Peru', 'PE'],
    ['Uruguay', 'UY'], ['Panama', 'PA'],
  ],
  unitedKingdom: [['United Kingdom', 'GB'], ['Jersey', 'JE'], ['Guernsey', 'GG'], ['Isle of Man', 'IM']],
  europeDeveloped: [
    ['Ireland', 'IE'], ['Netherlands', 'NL'], ['Switzerland', 'CH'], ['Germany', 'DE'], ['France', 'FR'],
    ['Denmark', 'DK'], ['Sweden', 'SE'], ['Norway', 'NO'], ['Finland', 'FI'], ['Belgium', 'BE'],
    ['Spain', 'ES'], ['Italy', 'IT'], ['Austria', 'AT'], ['Portugal', 'PT'], ['Luxembourg', 'LU'],
    ['Monaco', 'MC'], ['Iceland', 'IS'],
  ],
  europeEmerging: [
    ['Poland', 'PL'], ['Czech Republic', 'CZ'], ['Hungary', 'HU'], ['Greece', 'GR'], ['Turkey', 'TR'],
    ['Kazakhstan', 'KZ'], ['Russia', 'RU'], ['Cyprus', 'CY'],
  ],
  africaMiddleEast: [
    ['Israel', 'IL'], ['South Africa', 'ZA'], ['Saudi Arabia', 'SA'], ['United Arab Emirates', 'AE'],
    ['Qatar', 'QA'], ['Kuwait', 'KW'], ['Egypt', 'EG'],
  ],
  japan: [['Japan', 'JP']],
  australasia: [['Australia', 'AU'], ['New Zealand', 'NZ']],
  asiaDeveloped: [['Hong Kong', 'HK'], ['Singapore', 'SG'], ['South Korea', 'KR'], ['Taiwan', 'TW'], ['Macau', 'MO']],
  asiaEmerging: [
    ['China', 'CN'], ['India', 'IN'], ['Indonesia', 'ID'], ['Malaysia', 'MY'], ['Philippines', 'PH'], ['Thailand', 'TH'],
    ['Vietnam', 'VN'],
  ],
};

/** Country (Yahoo name or ISO alpha-2 code) to sub-region (D-06). */
export const COUNTRY_REGION: Record<string, SubRegionKey> = Object.fromEntries(
  SUB_REGIONS.flatMap((region) => COUNTRIES[region].flatMap(([name, iso]) => [[name, region], [iso, region]])),
);

/** True when the country is the United States (D-07). */
export function isUsCountry(country: string | null): boolean {
  return country === 'United States' || country === 'US';
}

/** Style box rows, largest first (D-10). */
export const STYLE_SIZES = ['large', 'mid', 'small'] as const;
export type StyleSize = (typeof STYLE_SIZES)[number];

/** Style box columns (D-10). */
export const STYLE_STYLES = ['value', 'blend', 'growth'] as const;
export type StyleStyle = (typeof STYLE_STYLES)[number];

/** Fixed-income sectors in table order (D-13). */
export const BOND_SECTORS = ['government', 'municipal', 'corporate', 'securitized', 'cash'] as const;
export type BondSectorKey = (typeof BOND_SECTORS)[number];

/** Credit quality buckets in table order; nr is not rated (D-13). */
export const CREDIT = ['aaa', 'aa', 'a', 'bbb', 'bb', 'b', 'belowB', 'nr'] as const;
export type CreditKey = (typeof CREDIT)[number];
