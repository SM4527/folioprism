import type { ReactNode } from 'react';
import type { SerializedBonds, SerializedPrismView } from '@/lib/engine/prism-view/types';
import { BOND_SECTORS, CREDIT, type BondSectorKey, type CreditKey } from '@/lib/engine/taxonomy';
import { formatYears } from '@/lib/format';
import { LABEL } from '@/components/styles';
import { CardFrame } from '@/components/prism-view/card-frame';
import { GroupTable, type GroupColumn, type GroupRow } from '@/components/prism-view/group-table';
import { MetricTable } from '@/components/prism-view/style-card';

const SECTOR_LABEL: Record<BondSectorKey, string> = {
  government: 'Government',
  municipal: 'Municipal',
  corporate: 'Corporate',
  securitized: 'Securitized',
  cash: 'Cash',
};

const CREDIT_LABEL: Record<CreditKey, string> = {
  aaa: 'AAA',
  aa: 'AA',
  a: 'A',
  bbb: 'BBB',
  bb: 'BB',
  b: 'B',
  belowB: 'Below B',
  nr: 'NR',
};

const COLUMNS: GroupColumn[] = [
  { key: 'port', header: 'Port %' },
  { key: 'bmark', header: 'Bmark %' },
];
const BAR = { port: 'port', bmark: 'bmark', width: 72 } as const;

/** Every key always gets a row; a missing block prints '—' (D-13). */
function rows<K extends string>(
  keys: readonly K[],
  labels: Record<K, string>,
  p: Record<K, string> | null,
  b: Record<K, string> | null,
  mono = false,
): GroupRow[] {
  return keys.map((k) => ({ kind: 'leaf', label: labels[k], mono, values: { port: p?.[k] ?? null, bmark: b?.[k] ?? null } }));
}

interface BondCardProps {
  bonds: NonNullable<SerializedPrismView['bonds']>;
  benchmark: string;
  busy: boolean;
}

/** Bond Analysis: fixed-income sectors, credit quality, duration and maturity, as % of bonds (XRAY-09). */
export function BondCard({ bonds, benchmark, busy }: BondCardProps) {
  const p = bonds.portfolio;
  const b: SerializedBonds | null = bonds.benchmark;
  return (
    <CardFrame title="Bond Analysis" aside="% of bonds" busy={busy} className="lg:col-span-2">
      <div className="grid grid-cols-1 divide-y lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <Column title="Fixed-income sectors" className="pb-4 lg:pr-6 lg:pb-0">
          <GroupTable
            group="bond-sectors"
            caption={`Fixed-income sectors, % of bonds, portfolio vs benchmark ${benchmark}`}
            labelHeader="Sector"
            columns={COLUMNS}
            rows={rows(BOND_SECTORS, SECTOR_LABEL, p.sectors, b?.sectors ?? null)}
            bar={BAR}
            minWidth="min-w-[320px]"
          />
        </Column>
        <Column title="Credit quality" className="py-4 lg:px-6 lg:py-0">
          <GroupTable
            group="credit"
            caption={`Credit quality, % of bonds, portfolio vs benchmark ${benchmark}`}
            labelHeader="Rating"
            columns={COLUMNS}
            rows={rows(CREDIT, CREDIT_LABEL, p.credit, b?.credit ?? null, true)}
            bar={BAR}
            minWidth="min-w-[320px]"
          />
        </Column>
        <Column title="Duration and maturity" className="pt-4 lg:pl-6 lg:pt-0">
          <MetricTable
            caption={`Duration and maturity, portfolio vs benchmark ${benchmark}`}
            rows={[
              {
                label: 'Effective duration',
                port: formatYears(p.effectiveDurationYears),
                bmark: formatYears(b?.effectiveDurationYears ?? null),
              },
              {
                label: 'Effective maturity',
                port: formatYears(p.effectiveMaturityYears),
                bmark: formatYears(b?.effectiveMaturityYears ?? null),
              },
            ]}
          />
        </Column>
      </div>
    </CardFrame>
  );
}

function Column({ title, className, children }: { title: string; className: string; children: ReactNode }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <h4 className={`mb-2 ${LABEL}`}>{title}</h4>
      {children}
    </div>
  );
}
