'use client';

import { useRef, useState } from 'react';
import type { Analysis } from '@/lib/analysis';
import { IntersectionTable } from '@/components/intersection/intersection-table';
import { IntersectionToolbar } from '@/components/intersection/intersection-toolbar';
import { CoverageNote } from '@/components/intersection/coverage-note';
import { unpricedNote } from '@/lib/format';

interface IntersectionPanelProps {
  analysis: Analysis | null;
  /** A refetch is in flight while a previous analysis is shown. */
  busy: boolean;
  failed: boolean;
  merge: boolean;
  onMergeChange: (merge: boolean) => void;
  /** An import or remove changed a fund's holdings; refetch the analysis. */
  onFundsChanged: () => void;
}

/** Stock Intersection panel; owns the filter and the expansion set, which survive refetches (D-21, D-22). */
export function IntersectionPanel({ analysis, busy, failed, merge, onMergeChange, onFundsChanged }: IntersectionPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const rows = analysis?.intersection.rows ?? null;
  const unpriced = analysis && unpricedNote(analysis.summary.unpricedTickers);
  const q = query.trim().toLowerCase();
  const ranked = (rows ?? [])
    .map((row, i) => ({ row, rank: i + 1 }))
    .filter(({ row }) => row.ticker.toLowerCase().includes(q) || row.name.toLowerCase().includes(q));

  function toggle(ticker: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(ticker)) next.add(ticker);
      return next;
    });
  }

  function setVisible(open: boolean) {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const { row } of ranked) {
        if (open) next.add(row.ticker);
        else next.delete(row.ticker);
      }
      return next;
    });
  }

  function clearFilter() {
    setQuery('');
    input.current?.focus();
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <IntersectionToolbar
        rows={rows}
        visibleCount={ranked.length}
        query={query}
        onQueryChange={setQuery}
        inputRef={input}
        onExpandAll={() => setVisible(true)}
        onCollapseAll={() => setVisible(false)}
        merge={merge}
        onMergeChange={onMergeChange}
      />
      <IntersectionTable
        rows={rows && ranked}
        total={rows?.length ?? 0}
        query={query}
        onClearFilter={clearFilter}
        failed={failed}
        busy={busy}
        expanded={expanded}
        onToggle={toggle}
      />
      {unpriced && <p className="border-t px-4 py-3 text-[13px] leading-5 text-destructive">{unpriced}</p>}
      {analysis && analysis.intersection.rows.length > 0 && (
        <div className={`transition-opacity duration-150 ${busy ? 'opacity-60' : ''}`} aria-busy={busy || undefined}>
          <CoverageNote coverage={analysis.intersection.coverage} onChanged={onFundsChanged} />
        </div>
      )}
    </section>
  );
}
