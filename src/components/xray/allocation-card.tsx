'use client';

import { Bar, BarChart, XAxis, YAxis, type BarShapeProps } from 'recharts';
import type { SerializedXray } from '@/lib/engine/xray/types';
import { ALLOCATION_KEYS, type AllocationKey } from '@/lib/engine/taxonomy';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { ALLOCATION_COLOR } from '@/components/palette';
import { CardFrame } from '@/components/xray/card-frame';
import { GroupTable, type GroupColumn } from '@/components/xray/group-table';

const LABELS: Record<AllocationKey, string> = {
  cash: 'Cash',
  usStock: 'US Stocks',
  nonUsStock: 'Non-US Stocks',
  bond: 'Bonds',
  other: 'Other / Not classified',
};

const COLUMNS: GroupColumn[] = [
  { key: 'net', header: 'Net %' },
  { key: 'long', header: 'Long %' },
  { key: 'short', header: 'Short %', muted: true },
  { key: 'bmark', header: 'Bmark %' },
];

const config = {
  portfolio: { label: 'Portfolio', color: 'var(--primary)' },
  bmark: { label: 'Benchmark', color: 'var(--muted-foreground)' },
} satisfies ChartConfig;

interface AllocationCardProps {
  allocation: SerializedXray['allocation'];
  benchmark: string;
  busy: boolean;
}

/** Asset Allocation: Recharts bars with benchmark ticks, then the Net / Long / Short / Bmark table (XRAY-02). */
export function AllocationCard({ allocation, benchmark, busy }: AllocationCardProps) {
  const { portfolio, benchmark: bmark } = allocation;
  const rows = ALLOCATION_KEYS.map((key) => ({
    kind: 'leaf' as const,
    label: LABELS[key],
    color: ALLOCATION_COLOR[key],
    values: { net: portfolio[key], long: portfolio[key], short: '0.0', bmark: bmark?.[key] ?? null },
  }));
  return (
    <CardFrame title="Asset Allocation" aside="% of portfolio" busy={busy}>
      <AllocationChart allocation={allocation} benchmark={benchmark} />
      <div className="mt-4">
        <GroupTable
          group="allocation"
          caption="Asset allocation, % of portfolio, portfolio vs benchmark"
          labelHeader="Asset class"
          columns={COLUMNS}
          rows={rows}
        />
      </div>
    </CardFrame>
  );
}

interface ChartRow {
  label: string;
  fill: string;
  portfolio: number;
  bmark: number | null;
  portText: string;
  bmarkText: string | null;
}

function AllocationChart({ allocation, benchmark }: Omit<AllocationCardProps, 'busy'>) {
  const data: ChartRow[] = ALLOCATION_KEYS.map((key) => {
    const b = allocation.benchmark?.[key] ?? null;
    return {
      label: LABELS[key],
      fill: ALLOCATION_COLOR[key].fill,
      portfolio: Number(allocation.portfolio[key]),
      bmark: b === null ? null : Number(b),
      portText: allocation.portfolio[key],
      bmarkText: b,
    };
  });
  return (
    <ChartContainer config={config} className="aspect-auto h-[140px] w-full" aria-hidden>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="label"
          width={128}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
        />
        <YAxis yAxisId="bmark" type="category" dataKey="label" hide />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="line"
              className="border-border shadow-none"
              formatter={(_value, name, item) => (
                <TooltipLine
                  benchmark={name === 'bmark'}
                  fill={(item.payload as ChartRow).fill}
                  label={name === 'bmark' ? `Benchmark ${benchmark}` : 'Portfolio'}
                  value={name === 'bmark' ? (item.payload as ChartRow).bmarkText : (item.payload as ChartRow).portText}
                />
              )}
            />
          }
        />
        <Bar dataKey="portfolio" barSize={12} isAnimationActive={false} shape={PortfolioBar} />
        <Bar
          dataKey="bmark"
          yAxisId="bmark"
          fill="var(--color-bmark)"
          barSize={16}
          isAnimationActive={false}
          shape={BenchmarkTick}
        />
      </BarChart>
    </ChartContainer>
  );
}

/** The portfolio bar in its asset-class color; nothing for a zero value. */
function PortfolioBar({ x, y, width, height, payload }: BarShapeProps) {
  if (!width || width <= 0) return <g />;
  return <rect x={x} y={y} width={width} height={height} rx={1} fill={(payload as ChartRow).fill} />;
}

/** Only a 1px x 16px slate rect at the bar's end; nothing for a zero or missing value. */
function BenchmarkTick({ x, y, width, height }: BarShapeProps) {
  if (!width || width <= 0) return <g />;
  return <rect x={Number(x) + Number(width) - 0.5} y={y} width={1} height={height} fill="var(--muted-foreground)" />;
}

interface TooltipLineProps {
  benchmark: boolean;
  fill: string;
  label: string;
  value: string | null;
}

function TooltipLine({ benchmark, fill, label, value }: TooltipLineProps) {
  return (
    <div className="flex w-full items-center gap-2">
      <span
        className={`h-3 shrink-0 ${benchmark ? 'w-px bg-muted-foreground' : 'w-1 rounded-[1px]'}`}
        style={benchmark ? undefined : { backgroundColor: fill }}
      />
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground tabular-nums">{value === null ? '—' : `${value}%`}</span>
    </div>
  );
}
