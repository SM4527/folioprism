import { REGION_GROUPS, SUB_REGIONS, type RegionGroupKey, type SubRegionKey } from '@/lib/engine/taxonomy';
import { CAPTION } from '@/components/styles';
import { heaviestIndex, rampStep } from '@/components/prism-view/ramp';

export const SUB_REGION_LABEL: Record<SubRegionKey, string> = {
  northAmerica: 'North America',
  latinAmerica: 'Latin America',
  unitedKingdom: 'United Kingdom',
  europeDeveloped: 'Europe Developed',
  europeEmerging: 'Europe Emerging',
  africaMiddleEast: 'Africa/Middle East',
  japan: 'Japan',
  australasia: 'Australasia',
  asiaDeveloped: 'Asia Developed',
  asiaEmerging: 'Asia Emerging',
};

export const REGION_GROUP_LABEL: Record<RegionGroupKey, string> = {
  americas: 'Americas',
  greaterEurope: 'Greater Europe',
  greaterAsia: 'Greater Asia',
};

const OUTLINE = 'outline outline-1 -outline-offset-2 outline-muted-foreground';

interface RegionStripProps {
  portfolio: Record<SubRegionKey, string>;
  bmark: Record<SubRegionKey, string> | null;
  benchmark: string;
}

/** Heat strip of the 10 sub-regions in 3 groups, teal ramp fills, slate outline on the benchmark's heaviest (D-18). */
export function RegionStrip({ portfolio, bmark, benchmark }: RegionStripProps) {
  const max = Math.max(0, ...SUB_REGIONS.map((k) => Number(portfolio[k])));
  const heaviest = bmark ? SUB_REGIONS[heaviestIndex(SUB_REGIONS.map((k) => bmark[k]))] : undefined;
  const groups = Object.entries(REGION_GROUPS) as [RegionGroupKey, readonly SubRegionKey[]][];
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: groups.map(([, ks]) => `${ks.length}fr`).join(' ') }} aria-hidden>
      {groups.map(([group, keys]) => (
        <div key={group} className="min-w-0">
          <div className="grid gap-px border bg-card" style={{ gridTemplateColumns: `repeat(${keys.length}, 1fr)` }}>
            {keys.map((k) => {
              const fill = rampStep(max > 0 ? Number(portfolio[k]) / max : 0).fill;
              const b = bmark ? `${bmark[k]}%` : '—';
              return (
                <div
                  key={k}
                  title={`${SUB_REGION_LABEL[k]}: portfolio ${portfolio[k]}%, benchmark ${benchmark} ${b}`}
                  className={`h-6 transition-colors duration-150 motion-reduce:transition-none ${k === heaviest ? OUTLINE : ''}`}
                  style={{ background: fill ?? undefined }}
                />
              );
            })}
          </div>
          <p className={`mt-1 truncate ${CAPTION}`}>{REGION_GROUP_LABEL[group]}</p>
        </div>
      ))}
    </div>
  );
}
