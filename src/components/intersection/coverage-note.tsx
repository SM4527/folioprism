import Decimal from 'decimal.js';
import type { ReactNode } from 'react';
import type { AnalysisCoverage, CoverageItem } from '@/lib/analysis';
import { Badge } from '@/components/ui/badge';
import { FundHoldingsTable } from '@/components/intersection/fund-holdings-table';
import { useFundImport } from '@/components/intersection/use-fund-import';
import { Notice } from '@/components/holdings/notice';

const oneDp = (pct: string) => new Decimal(pct).toFixed(1);

/** Look-through coverage, reported but never renormalized (D-25, INT-08), with the fund holdings ledger. */
export function CoverageNote({ coverage, onChanged }: { coverage: AnalysisCoverage; onChanged: () => void }) {
  const { inputProps, pick, remove, busy, notice, dismiss } = useFundImport(onChanged);
  const { fundCoveredPct, fundOtherPct, items } = coverage;
  const fundItems = items.filter((i) => i.source !== 'direct');
  const directItems = items.filter((i) => i.source === 'direct');
  return (
    <div className="border-t px-4 py-3 text-[13px] leading-5">
      {fundCoveredPct !== null && fundOtherPct !== null ? (
        <p>
          Look-through coverage: <Figure>{oneDp(fundCoveredPct)}%</Figure> of fund assets.{' '}
          <Figure>{oneDp(fundOtherPct)}%</Figure> held in positions not disclosed.
        </p>
      ) : (
        <p>No funds to look through. All stock exposure is held directly.</p>
      )}
      <input {...inputProps} />
      {fundCoveredPct !== null && (
        <FundHoldingsTable items={fundItems} busy={busy} onImport={pick} onRemove={remove} />
      )}
      {directItems.length > 0 && (
        <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs leading-4">
          <li className="text-muted-foreground">Direct:</li>
          {directItems.map((item) => (
            <CoverageEntry key={item.ticker} item={item} />
          ))}
        </ul>
      )}
      {notice && <Notice {...notice} onDismiss={dismiss} className="mt-2 mb-0" />}
    </div>
  );
}

function Figure({ children }: { children: ReactNode }) {
  return <span className="font-mono font-semibold tabular-nums">{children}</span>;
}

function CoverageEntry({ item }: { item: CoverageItem }) {
  return (
    <li className="inline-flex items-center gap-1">
      <span className="font-mono font-semibold">{item.ticker}</span>
      <span className="font-mono tabular-nums">{oneDp(item.coveredPct)}%</span>
      <Badge
        variant="outline"
        className="h-4 rounded-[4px] bg-transparent px-1 py-0 text-[11px] leading-4 font-normal text-muted-foreground"
      >
        direct
      </Badge>
    </li>
  );
}
