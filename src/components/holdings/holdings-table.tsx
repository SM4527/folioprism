import type { Analysis } from '@/lib/analysis';
import type { HoldingRow as Holding } from '@/lib/holdings';
import { formatCents, positionsLabel, unpricedNote } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { HoldingRow, SKELETON } from '@/components/holdings/holding-row';
import { QuickAddRow } from '@/components/holdings/quick-add-row';
import { LABEL } from '@/components/styles';

const COLUMNS = [
  { label: 'Ticker', className: 'w-32' },
  { label: 'Mode', className: 'w-24' },
  { label: 'Shares / $', className: 'min-w-40 text-right' },
  { label: 'Live Price', className: 'w-44 text-right' },
  { label: 'Total Value', className: 'w-38 text-right' },
  { label: 'Status', className: 'w-24', hidden: true },
  { label: 'Delete', className: 'w-10', hidden: true },
];

interface HoldingsTableProps {
  holdings: Holding[];
  onChange: (row: Holding) => void;
  onRemove: (row: Holding) => () => void;
  onAdded: (row: Holding, created: boolean) => void;
  onAddFailed: (ticker: string, error: string) => void;
  onSaved: () => void;
  analysis: Analysis | null;
  /** False only before the first analysis attempt finishes. */
  loaded: boolean;
  /** A refetch is in flight while a previous analysis is shown. */
  busy: boolean;
}

/** The holdings ledger panel with the quick-add row (D-12, UI-SPEC layout contract). */
export function HoldingsTable(props: HoldingsTableProps) {
  const { holdings, onChange, onRemove, onAdded, onAddFailed, onSaved, analysis, loaded, busy } = props;
  const prices = new Map(analysis?.holdings.map((h) => [h.id, h]));
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex h-10 items-center justify-between border-b px-4">
        <h2 className={LABEL}>Holdings</h2>
        <span className="text-[13px] text-muted-foreground">{positionsLabel(holdings.length)}</span>
      </div>
      <Table className="min-w-[808px] table-fixed text-[13px] leading-5">
        <TableHeader className="bg-secondary">
          <TableRow className="h-8 hover:bg-transparent">
            {COLUMNS.map((c) => (
              <TableHead key={c.label} className={`h-8 px-3 ${LABEL} ${c.className}`}>
                {c.hidden ? <span className="sr-only">{c.label}</span> : c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {holdings.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={COLUMNS.length} className="py-8 text-center">
                <p className="text-base leading-5 font-semibold">No holdings yet</p>
                <p className="mt-1 text-muted-foreground">
                  Add a ticker below, or import a CSV exported from your broker.
                </p>
              </TableCell>
            </TableRow>
          ) : (
            holdings.map((h) => (
              <HoldingRow
                key={h.id}
                holding={h}
                onChange={onChange}
                onRemove={onRemove}
                price={prices.get(h.id)}
                loaded={loaded}
                busy={busy}
                onSaved={onSaved}
              />
            ))
          )}
          <QuickAddRow autoFocus={holdings.length === 0} onAdded={onAdded} onFailed={onAddFailed} />
        </TableBody>
        {holdings.length > 0 && <TotalFooter analysis={analysis} loaded={loaded} busy={busy} />}
      </Table>
    </section>
  );
}

/** The unpriced warning first, else the stale summary. */
function footerNote(analysis: Analysis): string | null {
  const unpriced = unpricedNote(analysis.summary.unpricedTickers);
  if (unpriced) return unpriced;
  return analysis.summary.staleTickers.length > 0 ? 'Some prices are delayed' : null;
}

/** Total Market Value row with the one-line unpriced or stale summary (D-17, D-18). */
function TotalFooter({ analysis, loaded, busy }: { analysis: Analysis | null; loaded: boolean; busy: boolean }) {
  const total = analysis ? formatCents(analysis.summary.totalCents) : <span className="text-muted-foreground">—</span>;
  return (
    <TableFooter className="bg-card">
      <TableRow className="h-10 hover:bg-transparent">
        <TableCell colSpan={3} className="px-3 text-xs leading-4 text-muted-foreground">
          {analysis && footerNote(analysis)}
        </TableCell>
        <TableCell className={`px-3 text-right ${LABEL}`}>Total Market Value</TableCell>
        <TableCell
          className={`px-3 text-right font-mono font-semibold tabular-nums transition-opacity duration-150 ${busy ? 'opacity-60' : ''}`}
          aria-busy={busy || undefined}
        >
          {loaded ? total : <Skeleton className={`${SKELETON} w-24`} />}
        </TableCell>
        <TableCell colSpan={2} />
      </TableRow>
    </TableFooter>
  );
}
