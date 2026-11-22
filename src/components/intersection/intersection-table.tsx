import type { ReactNode } from 'react';
import type { SerializedRow } from '@/lib/engine/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IntersectionRow } from '@/components/intersection/intersection-rows';
import { LABEL } from '@/components/styles';

const COLUMNS = [
  { label: '#', className: 'w-12 text-right' },
  { label: '% of Net Assets', className: 'w-28 text-right' },
  { label: 'Underlying Stocks / Holdings', className: 'min-w-70' },
  { label: 'Ticker', className: 'w-24' },
  { label: '% of Portfolio Net Assets', className: 'w-38 text-right' },
  { label: '($) Market Value', className: 'w-40 text-right' },
];

const BAR = 'h-3 rounded-[2px] bg-secondary';
const SKELETON_ROWS = 8;

/** A visible parent row with its original Top 50 rank. */
export interface RankedRow {
  row: SerializedRow;
  rank: number;
}

interface IntersectionTableProps {
  /** Visible rows; null until the first analysis lands (or when it failed). */
  rows: RankedRow[] | null;
  /** Number of parent rows before filtering. */
  total: number;
  query: string;
  onClearFilter: () => void;
  failed: boolean;
  busy: boolean;
  expanded: Set<string>;
  onToggle: (ticker: string) => void;
}

/** The Top 50 table with skeleton, error, empty and no-match states (D-15, D-20, D-22). */
export function IntersectionTable(props: IntersectionTableProps) {
  const { busy } = props;
  return (
    <Table
      className={`min-w-[880px] table-fixed text-[13px] leading-5 transition-opacity duration-150 ${busy ? 'opacity-60' : ''}`}
      aria-busy={busy || undefined}
    >
      <caption className="sr-only">Top 50 underlying stocks with the funds and direct holdings they come from</caption>
      <TableHeader className="bg-secondary">
        <TableRow className="h-10 hover:bg-transparent">
          {COLUMNS.map((c) => (
            <TableHead key={c.label} className={`h-10 px-3 whitespace-normal ${LABEL} ${c.className}`}>
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{body(props)}</TableBody>
    </Table>
  );
}

function body({ rows, total, query, onClearFilter, failed, expanded, onToggle }: IntersectionTableProps) {
  if (rows === null && failed)
    return (
      <StateRow
        heading="Prices and holdings could not be loaded"
        body="Check that the app is running, then reload the page."
      />
    );
  if (rows === null) return Array.from({ length: SKELETON_ROWS }, (_, i) => <SkeletonRow key={i} />);
  if (total === 0)
    return (
      <StateRow
        heading="No stocks to show"
        body="Add a stock, ETF or fund above to see the stocks you own through it."
      />
    );
  if (rows.length === 0)
    return (
      <StateRow heading={`No stocks match "${query}"`} body="Try a ticker such as AAPL or part of a company name.">
        <Button
          variant="ghost"
          className="mt-2 text-[13px] font-normal text-foreground underline underline-offset-2"
          onClick={onClearFilter}
        >
          Clear filter
        </Button>
      </StateRow>
    );
  return rows.map(({ row, rank }) => (
    <IntersectionRow
      key={row.ticker}
      row={row}
      rank={rank}
      expanded={expanded.has(row.ticker)}
      onToggle={onToggle}
    />
  ));
}

function SkeletonRow() {
  return (
    <TableRow className="h-9 hover:bg-transparent">
      <TableCell className="px-3" />
      <TableCell className="px-3" />
      <TableCell className="px-3">
        <Skeleton className={`${BAR} w-1/2`} />
      </TableCell>
      <TableCell className="px-3" />
      <TableCell className="px-3">
        <Skeleton className={`${BAR} ml-auto w-12`} />
      </TableCell>
      <TableCell className="px-3">
        <Skeleton className={`${BAR} ml-auto w-20`} />
      </TableCell>
    </TableRow>
  );
}

function StateRow({ heading, body, children }: { heading: string; body: string; children?: ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={COLUMNS.length} className="py-8 text-center whitespace-normal">
        <p className="text-base leading-5 font-semibold">{heading}</p>
        <p className="mt-1 text-muted-foreground">{body}</p>
        {children}
      </TableCell>
    </TableRow>
  );
}
