import Decimal from 'decimal.js';
import { Loader2, RotateCcw, Upload } from 'lucide-react';
import type { CoverageItem } from '@/lib/analysis';
import { formatHoldingsDate } from '@/lib/format';
import { asOfTitle, isStale, linkable, sourceLabel } from '@/lib/provenance';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { FundBusy } from '@/components/intersection/use-fund-import';
import { FIG, GT_CELL, GT_HEAD, GT_ROW, LABEL } from '@/components/styles';

const LINK =
  'text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const STALE_CHIP =
  'ml-2 h-4 rounded-[4px] px-1 py-0 text-[11px] leading-4 font-normal border-amber-300 bg-amber-50 text-amber-800';

interface FundActions {
  busy: FundBusy | null;
  onImport: (ticker: string) => void;
  onRemove: (ticker: string) => void;
}

/** One ledger row per held fund: covered %, holdings source, holdings as-of date and import actions (04.1-UI-SPEC). */
export function FundHoldingsTable({ items, ...actions }: { items: CoverageItem[] } & FundActions) {
  return (
    <>
      <p className={LABEL + ' mt-2'}>Fund holdings</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed text-[13px] leading-5">
          <caption className="sr-only">Fund holdings sources</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className={`${GT_HEAD} w-20 pl-0 text-left`}>Fund</th>
              <th scope="col" className={`${GT_HEAD} w-24 text-right`}>Covered %</th>
              <th scope="col" className={`${GT_HEAD} text-left`}>Source</th>
              <th scope="col" className={`${GT_HEAD} w-44 text-left`}>Holdings as of</th>
              <th scope="col" className={`${GT_HEAD} w-16`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <FundRow key={item.ticker} item={item} {...actions} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FundRow({ item, ...actions }: { item: CoverageItem } & FundActions) {
  const stale = isStale(item.holdingsAsOf);
  const title = item.unavailable
    ? `${item.ticker} holdings could not be loaded. Its full value is counted as Other.`
    : undefined;
  return (
    <tr className={GT_ROW} data-fund={item.ticker} data-source={item.source} title={title}>
      <td className={`${GT_CELL} pl-0 font-mono font-semibold`}>{item.ticker}</td>
      <td className={`${GT_CELL} ${FIG}`}>{new Decimal(item.coveredPct).toFixed(1)}</td>
      <td className={`${GT_CELL} truncate`}>
        <SourceLabel item={item} />
      </td>
      <td
        className={`${GT_CELL} whitespace-nowrap font-mono tabular-nums`}
        data-col="asof"
        data-stale={stale || undefined}
        title={asOfTitle(item)}
      >
        <span className={item.holdingsAsOf ? undefined : 'text-muted-foreground'}>{formatHoldingsDate(item.holdingsAsOf)}</span>
        {stale && (
          <Badge
            variant="outline"
            className={STALE_CHIP}
            title="Holdings older than 180 days. Import a newer issuer file or run scripts/refresh-funds.sh."
          >
            Stale
          </Badge>
        )}
      </td>
      <td className={GT_CELL}>
        <RowActions item={item} {...actions} />
      </td>
    </tr>
  );
}

function SourceLabel({ item }: { item: CoverageItem }) {
  const label = sourceLabel(item);
  if (linkable(item)) {
    return (
      <a href={item.sourceUrl!} target="_blank" rel="noreferrer" className={LINK}>
        {label}
      </a>
    );
  }
  return <span className={item.unavailable ? 'text-muted-foreground' : undefined}>{label}</span>;
}

const ICON = 'size-3.5';
const SPIN = 'size-3.5 animate-spin motion-reduce:animate-none';

/** Import (every fund) and remove (imported funds only) buttons; all disabled while a request runs. */
function RowActions({ item, busy, onImport, onRemove }: { item: CoverageItem } & FundActions) {
  const { ticker } = item;
  const spinning = (action: FundBusy['action']) => busy?.ticker === ticker && busy.action === action;
  const back = item.curated ? 'curated data' : 'Yahoo top 10';
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        data-action="import"
        aria-label={`Import holdings for ${ticker}`}
        title={`Import holdings for ${ticker} from an issuer CSV. It replaces the current holdings. Needs a header row with a ticker column and a weight column.`}
        aria-busy={spinning('upload') || undefined}
        disabled={busy !== null}
        onClick={() => onImport(ticker)}
      >
        {spinning('upload') ? <Loader2 className={SPIN} aria-hidden /> : <Upload className={ICON} aria-hidden />}
      </Button>
      {item.source === 'imported' && (
        <Button
          variant="ghost"
          size="icon-sm"
          data-action="remove"
          aria-label={`Remove imported holdings for ${ticker}`}
          title={`Remove imported holdings for ${ticker} and go back to ${back}`}
          aria-busy={spinning('remove') || undefined}
          disabled={busy !== null}
          onClick={() => onRemove(ticker)}
        >
          {spinning('remove') ? <Loader2 className={SPIN} aria-hidden /> : <RotateCcw className={ICON} aria-hidden />}
        </Button>
      )}
    </div>
  );
}
