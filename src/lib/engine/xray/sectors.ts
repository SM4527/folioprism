import { SECTORS, SUPER_SECTORS, type SectorKey, type SuperSectorKey } from '../taxonomy';
import { equityBreakdown, single } from './breakdown';
import type { EquityBreakdown, XrayInput } from './types';
import { scaled } from './weights';

/** Equity-weighted 11 sectors in 3 super-sectors (D-06, D-08). */
export function sectors(input: XrayInput): EquityBreakdown<SectorKey, SuperSectorKey> | null {
  return equityBreakdown(input, SECTORS, SUPER_SECTORS, (h) => {
    if (h.kind !== 'FUND') return single(input.stocks[h.ticker]?.sector);
    const block = input.funds[h.ticker]?.sectors;
    return block ? scaled(block) : null;
  });
}
