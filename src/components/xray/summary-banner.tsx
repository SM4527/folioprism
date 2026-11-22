import type { ReactNode } from 'react';
import type { Analysis } from '@/lib/analysis';
import { formatAsOfDateTime, formatCents } from '@/lib/format';
import { BENCHMARKS } from '@/lib/benchmarks';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LABEL } from '@/components/styles';

interface SummaryBannerProps {
  name: string;
  benchmark: string;
  summary: Analysis['summary'] | null;
  failed: boolean;
  busy: boolean;
}

const DASH = <span className="text-muted-foreground">—</span>;
const SKELETON = 'rounded-[2px] bg-secondary motion-reduce:animate-none';

/** Ruled strip with name, benchmark, total market value, as-of and the tab's single legend (XRAY-01). */
export function SummaryBanner({ name, benchmark, summary, failed, busy }: SummaryBannerProps) {
  const description = BENCHMARKS.find((b) => b.ticker === benchmark)?.label;
  const loading = summary === null && !failed;
  const dim = `transition-opacity duration-150 ${busy ? 'opacity-60' : ''}`;
  return (
    <div className="flex min-h-[76px] flex-wrap items-center gap-y-4 rounded-lg border bg-card px-4 py-3">
      <Field label="Portfolio">
        <span className="text-[13px] leading-5 font-semibold">{name}</span>
      </Field>
      <Rule />
      <Field label="Benchmark">
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[13px] leading-5 font-semibold">{benchmark}</span>
          {description && <span className="text-xs leading-4 text-muted-foreground">{description}</span>}
        </span>
      </Field>
      <Rule />
      <Field label="Total Market Value">
        <span className={dim} aria-busy={busy || undefined}>
          {loading ? (
            <Skeleton className={`${SKELETON} my-1 h-6 w-40`} />
          ) : (
            <span className="font-mono text-[28px] leading-8 font-semibold tabular-nums">
              {summary ? formatCents(summary.totalCents) : DASH}
            </span>
          )}
        </span>
      </Field>
      <Rule />
      <Field label="As of">
        <span className={dim} aria-busy={busy || undefined}>
          {loading ? <Skeleton className={`${SKELETON} my-1 h-3 w-24`} /> : <AsOf summary={summary} />}
        </span>
      </Field>
      <Legend benchmark={benchmark} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={LABEL}>{label}</span>
      {children}
    </div>
  );
}

function Rule() {
  return <div className="mx-6 h-10 w-px bg-border" aria-hidden />;
}

function AsOf({ summary }: { summary: Analysis['summary'] | null }) {
  if (!summary?.asOf) return DASH;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-[13px] leading-5 tabular-nums">{formatAsOfDateTime(summary.asOf)}</span>
      {summary.staleTickers.length > 0 && (
        <Badge
          variant="outline"
          title="Some prices are delayed"
          className="h-4 rounded-[4px] bg-transparent px-1 py-0 text-[11px] leading-4 font-normal text-muted-foreground"
        >
          stale
        </Badge>
      )}
    </span>
  );
}

function Legend({ benchmark }: { benchmark: string }) {
  return (
    <div className="ml-auto flex items-center gap-4 pl-6 text-xs leading-4 text-muted-foreground">
      <span className="inline-flex items-center gap-2">
        <span className="h-2 w-3 rounded-[1px] bg-primary" aria-hidden />
        Portfolio
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-px bg-muted-foreground" aria-hidden />
        <span>
          Benchmark <span className="font-mono">{benchmark}</span>
        </span>
      </span>
    </div>
  );
}
