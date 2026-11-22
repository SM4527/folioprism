'use client';

import type { KeyboardEvent, Ref } from 'react';
import { ChevronsDownUp, ChevronsUpDown, Download, Search, X } from 'lucide-react';
import type { SerializedRow } from '@/lib/engine/types';
import { exportFilename, intersectionCsv } from '@/lib/csv-export';
import { stocksLabel } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

const FILTER =
  'h-8 rounded-[5px] bg-card pl-7 pr-8 text-[13px] md:text-[13px] focus-visible:border-primary';

interface IntersectionToolbarProps {
  /** The full Top 50; null until the first analysis lands. */
  rows: SerializedRow[] | null;
  visibleCount: number;
  query: string;
  onQueryChange: (query: string) => void;
  inputRef: Ref<HTMLInputElement>;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  merge: boolean;
  onMergeChange: (merge: boolean) => void;
}

/** Download the full Top 50 as CSV, ignoring filter and expansion (D-24). */
function download(rows: SerializedRow[]) {
  const url = URL.createObjectURL(new Blob([intersectionCsv(rows)], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename();
  a.click();
  URL.revokeObjectURL(url);
}

/** Expand/collapse all, filter with count, merge switch and Export CSV (D-21 to D-24). */
export function IntersectionToolbar(props: IntersectionToolbarProps) {
  const { rows, visibleCount, query, onQueryChange, inputRef, merge, onMergeChange } = props;
  const hasRows = rows !== null && rows.length > 0;
  const noneVisible = !hasRows || visibleCount === 0;

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onQueryChange('');
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-card px-4 py-3 text-[13px] lg:h-12 lg:flex-nowrap lg:py-0">
      <div className="flex items-center gap-2">
        <Button variant="outline" className="text-[13px]" disabled={noneVisible} onClick={props.onExpandAll}>
          <ChevronsUpDown className="size-3.5" aria-hidden />
          Expand all
        </Button>
        <Button variant="outline" className="text-[13px]" disabled={noneVisible} onClick={props.onCollapseAll}>
          <ChevronsDownUp className="size-3.5" aria-hidden />
          Collapse all
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-56">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={inputRef}
            type="text"
            className={FILTER}
            placeholder="Filter by ticker or name"
            aria-label="Filter by ticker or name"
            value={query}
            disabled={!hasRows}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {query && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
              aria-label="Clear filter"
              onClick={() => onQueryChange('')}
            >
              <X className="size-3" aria-hidden />
            </Button>
          )}
        </div>
        <span className="text-xs leading-4 text-muted-foreground tabular-nums" aria-live="polite">
          {rows !== null && stocksLabel(visibleCount, rows.length)}
        </span>
      </div>
      <label
        className="flex cursor-pointer items-center gap-2 has-data-disabled:cursor-not-allowed"
        title="Combine GOOG with GOOGL and BRK.A with BRK.B"
      >
        <Switch checked={merge} disabled={rows === null} onCheckedChange={(checked) => onMergeChange(checked)} />
        Merge share classes
      </label>
      <Button variant="outline" className="ml-auto text-[13px]" disabled={!hasRows} onClick={() => download(rows!)}>
        <Download className="size-3.5" aria-hidden />
        Export CSV
      </Button>
    </div>
  );
}
