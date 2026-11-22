import type { ReactNode } from 'react';
import type { SerializedBreakdown, SerializedXray } from '@/lib/engine/xray/types';
import { REGION_GROUPS, SUPER_SECTORS, type SectorKey, type SuperSectorKey } from '@/lib/engine/taxonomy';
import { SUPER_SECTOR_COLOR, type CategoryColor } from '@/components/palette';
import { LABEL } from '@/components/styles';
import { CardFrame } from '@/components/xray/card-frame';
import { GroupTable, type GroupColumn, type GroupRow } from '@/components/xray/group-table';
import { REGION_GROUP_LABEL, RegionStrip, SUB_REGION_LABEL } from '@/components/xray/region-strip';
import { SectorTriangle } from '@/components/xray/sector-triangle';

const SECTOR_LABEL: Record<SectorKey, string> = {
  basicMaterials: 'Basic Materials',
  consumerCyclical: 'Consumer Cyclical',
  financialServices: 'Financial Services',
  realEstate: 'Real Estate',
  communicationServices: 'Communication Services',
  energy: 'Energy',
  industrials: 'Industrials',
  technology: 'Technology',
  consumerDefensive: 'Consumer Defensive',
  healthcare: 'Healthcare',
  utilities: 'Utilities',
};

const SUPER_SECTOR_LABEL: Record<SuperSectorKey, string> = {
  cyclical: 'Cyclical',
  sensitive: 'Sensitive',
  defensive: 'Defensive',
};

const COLUMNS: GroupColumn[] = [
  { key: 'port', header: 'Port %' },
  { key: 'bmark', header: 'Bmark %' },
];
const BAR = { port: 'port', bmark: 'bmark' } as const;

/** Group rows, their children, then Not classified, from the engine's 1dp strings (D-15); groups and their children take the group color. */
function breakdownRows<K extends string, G extends string>(
  p: SerializedBreakdown<K, G>,
  b: SerializedBreakdown<K, G> | null,
  groups: Record<G, readonly K[]>,
  leafLabel: Record<K, string>,
  groupLabel: Record<G, string>,
  groupColor?: Record<G, CategoryColor>,
): GroupRow[] {
  const rows = (Object.entries(groups) as [G, K[]][]).flatMap(([g, keys]) => {
    const color = groupColor?.[g];
    return [
      { kind: 'group' as const, label: groupLabel[g], color, values: { port: p.groups[g], bmark: b?.groups[g] ?? null } },
      ...keys.map((k) => ({
        kind: 'leaf' as const,
        label: leafLabel[k],
        color,
        values: { port: p.leaves[k], bmark: b?.leaves[k] ?? null },
      })),
    ];
  });
  return [...rows, { kind: 'notClassified', label: 'Not classified', values: { port: p.notClassified, bmark: b?.notClassified ?? null } }];
}

interface StockAnalysisCardProps {
  sectors: SerializedXray['sectors'];
  regions: SerializedXray['regions'];
  benchmark: string;
  busy: boolean;
}

/** Stock Analysis: sectors with the super-sector triangle, world regions with the heat strip (XRAY-03, XRAY-04). */
export function StockAnalysisCard({ sectors, regions, benchmark, busy }: StockAnalysisCardProps) {
  const sp = sectors.portfolio;
  const rp = regions.portfolio;
  return (
    <CardFrame title="Stock Analysis" aside="% of equity" busy={busy} className="lg:col-span-2">
      <div className="grid grid-cols-1 divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <Half title="Sectors" className="pb-4 lg:pr-6 lg:pb-0">
          {sp && (
            <>
              <SectorTriangle portfolio={sp.groups} bmark={sectors.benchmark?.groups ?? null} benchmark={benchmark} />
              <GroupTable
                group="sectors"
                caption={`Stock sectors, % of equity, portfolio vs benchmark ${benchmark}`}
                labelHeader="Sector"
                columns={COLUMNS}
                rows={breakdownRows(sp, sectors.benchmark, SUPER_SECTORS, SECTOR_LABEL, SUPER_SECTOR_LABEL, SUPER_SECTOR_COLOR)}
                bar={BAR}
                minWidth="min-w-[440px]"
              />
            </>
          )}
        </Half>
        <Half title="World Regions" className="pt-4 lg:pt-0 lg:pl-6">
          {rp && (
            <>
              <RegionStrip portfolio={rp.leaves} bmark={regions.benchmark?.leaves ?? null} benchmark={benchmark} />
              <GroupTable
                group="regions"
                caption={`World regions, % of equity, portfolio vs benchmark ${benchmark}`}
                labelHeader="Region"
                columns={COLUMNS}
                rows={breakdownRows(rp, regions.benchmark, REGION_GROUPS, SUB_REGION_LABEL, REGION_GROUP_LABEL)}
                bar={BAR}
                minWidth="min-w-[440px]"
              />
            </>
          )}
        </Half>
      </div>
    </CardFrame>
  );
}

function Half({ title, className, children }: { title: string; className: string; children: ReactNode }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <h4 className={`mb-2 ${LABEL}`}>{title}</h4>
      {children ? (
        <div className="flex flex-col gap-4">{children}</div>
      ) : (
        <div className="py-6 text-[13px] leading-5">
          <p className="font-semibold">No stock exposure</p>
          <p className="text-muted-foreground">Sectors and regions appear when the portfolio holds stocks or stock funds.</p>
        </div>
      )}
    </div>
  );
}
