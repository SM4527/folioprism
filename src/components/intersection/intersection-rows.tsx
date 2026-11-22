import { Fragment, type KeyboardEvent } from 'react';
import Decimal from 'decimal.js';
import { ChevronRight } from 'lucide-react';
import type { SerializedRow } from '@/lib/engine/types';
import { formatCents } from '@/lib/format';
import { TableCell, TableRow } from '@/components/ui/table';

const CELL = 'px-3 py-0';
const NUM = `${CELL} text-right font-mono tabular-nums`;

interface IntersectionRowProps {
  row: SerializedRow;
  rank: number;
  expanded: boolean;
  onToggle: (ticker: string) => void;
}

/** One aggregated stock (bold, sapphire band with a left accent) and, when expanded, its white source rows (D-20, D-21). */
export function IntersectionRow({ row, rank, expanded, onToggle }: IntersectionRowProps) {
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onToggle(row.ticker);
  }

  return (
    <Fragment>
      <TableRow
        className="h-9 cursor-pointer border-t bg-blue-50 font-semibold hover:bg-blue-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => onToggle(row.ticker)}
        onKeyDown={onKeyDown}
      >
        <TableCell className={`${NUM} text-xs leading-4 font-normal text-muted-foreground shadow-[inset_2px_0_0_var(--chart-2)]`}>
          {rank}
        </TableCell>
        <TableCell className={CELL} />
        <TableCell className={CELL}>
          <span className="flex items-center gap-2">
            <ChevronRight
              className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`}
              aria-hidden
            />
            <span className="truncate" title={row.name}>
              {row.name}
            </span>
          </span>
        </TableCell>
        <TableCell className={`${CELL} font-mono`}>{row.ticker}</TableCell>
        <TableCell className={NUM}>{row.portfolioPctDisplay}%</TableCell>
        <TableCell className={NUM}>{formatCents(row.valueCents)}</TableCell>
      </TableRow>
      {expanded &&
        row.children.map((c) => (
          <TableRow key={c.sourceTicker} className="h-8 bg-card hover:bg-slate-50">
            <TableCell className={CELL} />
            <TableCell className={`${NUM} text-muted-foreground`}>{new Decimal(c.fundWeightPct).toFixed(2)}%</TableCell>
            <TableCell className={CELL}>
              <span className="ml-7 block truncate border-l border-slate-200 pl-3" title={c.sourceName}>
                {c.sourceName}
              </span>
            </TableCell>
            <TableCell className={`${CELL} font-mono`}>{c.sourceTicker}</TableCell>
            <TableCell className={NUM}>{c.portfolioPctDisplay}%</TableCell>
            <TableCell className={NUM}>{formatCents(c.valueCents)}</TableCell>
          </TableRow>
        ))}
    </Fragment>
  );
}
