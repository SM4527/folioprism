import { COUNTRY_REGION, REGION_GROUPS, SUB_REGIONS, type RegionGroupKey, type SubRegionKey } from '../taxonomy';
import { equityBreakdown, single } from './breakdown';
import type { EquityBreakdown, XrayInput } from './types';
import { scaled } from './weights';

/** Equity-weighted 10 sub-regions in 3 region groups; stocks map by country (D-06, D-08). */
export function regions(input: XrayInput): EquityBreakdown<SubRegionKey, RegionGroupKey> | null {
  return equityBreakdown(input, SUB_REGIONS, REGION_GROUPS, (h) => {
    if (h.kind !== 'FUND') return single(COUNTRY_REGION[input.stocks[h.ticker]?.country ?? '']);
    const block = input.funds[h.ticker]?.regions;
    return block ? scaled(block) : null;
  });
}
