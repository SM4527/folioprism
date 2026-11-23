import type { Analysis } from '@/lib/analysis';
import { Skeleton } from '@/components/ui/skeleton';
import { AllocationCard } from '@/components/prism-view/allocation-card';
import { BondCard } from '@/components/prism-view/bond-card';
import { CardFrame } from '@/components/prism-view/card-frame';
import { StockAnalysisCard } from '@/components/prism-view/stock-analysis-card';
import { StyleCard } from '@/components/prism-view/style-card';
import { SummaryBanner } from '@/components/prism-view/summary-banner';

interface PrismViewOverviewProps {
  analysis: Analysis | null;
  /** A refetch is in flight while a previous analysis is shown. */
  busy: boolean;
  failed: boolean;
  name: string;
  /** Shown in the banner only until the first analysis arrives; after that the analysis's benchmark is used. */
  benchmark: string;
}

const GRID = 'grid grid-cols-1 items-start gap-4 lg:grid-cols-2';

const SKELETON_FRAMES = [
  { title: 'Asset Allocation', aside: '% of portfolio', className: '' },
  { title: 'Investment Style', aside: undefined, className: '' },
  { title: 'Stock Analysis', aside: '% of equity', className: 'lg:col-span-2' },
];
const SKELETON_WIDTHS = ['w-full', 'w-4/5', 'w-3/5', 'w-full', 'w-4/5', 'w-3/5'];

/** The Prism View tab: summary banner, then the card grid or a state panel (D-17, 04-UI-SPEC States). */
export function PrismViewOverview({ analysis, busy, failed, name, benchmark }: PrismViewOverviewProps) {
  return (
    <div className="flex flex-col gap-4">
      <SummaryBanner
        name={name}
        benchmark={analysis?.summary.benchmark ?? benchmark}
        summary={analysis?.summary ?? null}
        failed={failed}
        busy={busy}
      />
      {body({ analysis, busy, failed })}
    </div>
  );
}

function body({ analysis, busy, failed }: Pick<PrismViewOverviewProps, 'analysis' | 'busy' | 'failed'>) {
  if (analysis === null && failed)
    return (
      <StatePanel
        heading="Prices and holdings could not be loaded"
        body="Check that the app is running, then reload the page."
      />
    );
  if (analysis === null) return <SkeletonGrid />;
  if (analysis.summary.totalCents === '0')
    return (
      <StatePanel
        heading="Nothing to analyze yet"
        body="Add a holding above to see its asset allocation, sectors, regions and investment style."
      />
    );
  return (
    <div className={GRID}>
      <AllocationCard allocation={analysis.prismView.allocation} benchmark={analysis.summary.benchmark} busy={busy} />
      <StyleCard
        styleBox={analysis.prismView.styleBox}
        valuation={analysis.prismView.valuation}
        fees={analysis.prismView.fees}
        benchmark={analysis.summary.benchmark}
        busy={busy}
      />
      <StockAnalysisCard
        sectors={analysis.prismView.sectors}
        regions={analysis.prismView.regions}
        benchmark={analysis.summary.benchmark}
        busy={busy}
      />
      {analysis.prismView.bonds && (
        <BondCard bonds={analysis.prismView.bonds} benchmark={analysis.summary.benchmark} busy={busy} />
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className={GRID}>
      {SKELETON_FRAMES.map((f) => (
        <CardFrame key={f.title} title={f.title} aside={f.aside} className={f.className}>
          <div className="flex flex-col gap-3">
            {SKELETON_WIDTHS.map((w, i) => (
              <Skeleton key={i} className={`h-3 rounded-[2px] bg-secondary motion-reduce:animate-none ${w}`} />
            ))}
          </div>
        </CardFrame>
      ))}
    </div>
  );
}

function StatePanel({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-8 text-center text-[13px] leading-5">
      <p className="font-semibold">{heading}</p>
      <p className="mt-1 text-muted-foreground">{body}</p>
    </div>
  );
}
