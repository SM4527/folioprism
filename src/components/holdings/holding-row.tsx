'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { isCashLike } from '@/lib/engine/ticker';
import type { InputMode } from '@/lib/engine/types';
import { type HoldingRow as Holding, validateAmount } from '@/lib/holdings';
import type { AnalysisHolding } from '@/lib/analysis';
import { formatAsOf, formatAsOfDate, formatAsOfDateTime, formatCents, formatUsd } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
import { ModeToggle } from '@/components/holdings/mode-toggle';

const EMPTY = <span className="text-muted-foreground">—</span>;
const DEBOUNCE_MS = 500;
const FADE = 'transition-opacity duration-150';
const DIM = `${FADE} opacity-60`;
export const SKELETON = 'ml-auto h-3 rounded-[2px] bg-secondary';
const CELL = 'px-3 py-0';

type Save = { state: 'idle' | 'saving' | 'saved' } | { state: 'error'; error: string };

interface HoldingRowProps {
  holding: Holding;
  onChange: (row: Holding) => void;
  /** Remove the row optimistically; returns a function that restores it. */
  onRemove: (row: Holding) => () => void;
  /** Priced view of this holding from /api/analysis, absent until it lands. */
  price?: AnalysisHolding;
  /** False only before the first analysis attempt finishes (skeletons). */
  loaded: boolean;
  /** A refetch is in flight while a previous analysis is shown (dim). */
  busy: boolean;
  /** Called after a PATCH or DELETE is confirmed by the server. */
  onSaved: () => void;
}

const withAmount = (h: Holding, mode: InputMode, amount: string): Holding =>
  mode === 'SHARES'
    ? { id: h.id, ticker: h.ticker, inputMode: mode, shares: amount }
    : { id: h.id, ticker: h.ticker, inputMode: mode, dollarAmount: amount };

const amountOf = (h: Holding) => (h.inputMode === 'SHARES' ? h.shares : h.dollarAmount) ?? '';

/** One editable ledger line: mode toggle, debounced amount auto-save, delete (D-14, D-15). */
export function HoldingRow({ holding, onChange, onRemove, price, loaded, busy, onSaved }: HoldingRowProps) {
  const [mode, setMode] = useState(holding.inputMode);
  const [text, setText] = useState(amountOf(holding));
  const [invalid, setInvalid] = useState<string | null>(null);
  const [save, setSave] = useState<Save>({ state: 'idle' });
  const [saveCount, setSaveCount] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seq = useRef(0);
  const sent = useRef<Holding>(undefined);
  const saved = useRef(holding);
  const queue = useRef(Promise.resolve());
  const [shown, setShown] = useState(holding);
  const locked = isCashLike(holding.ticker);

  if (shown !== holding) {
    setShown(holding);
    setMode(holding.inputMode);
    setText(amountOf(holding));
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (holding === sent.current) return;
    clearTimeout(timer.current);
    saved.current = holding;
  }, [holding]);

  /** Queue a save so writes reach the server in edit order. */
  function patch(next: Holding) {
    const id = ++seq.current;
    setSave({ state: 'saving' });
    queue.current = queue.current.then(() => send(next, id));
  }

  async function send(next: Holding, id: number) {
    const body = { inputMode: next.inputMode, shares: next.shares, dollarAmount: next.dollarAmount };
    const res = await fetch(`/api/holdings/${holding.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (res?.ok) saved.current = next;
    if (id !== seq.current) return;
    if (res?.ok) {
      setSave({ state: 'saved' });
      setSaveCount((n) => n + 1);
      onSaved();
    } else {
      const error = res ? ((await res.json().catch(() => null))?.error ?? res.statusText) : 'Network error';
      setSave({ state: 'error', error });
      onChange(saved.current);
    }
  }

  /** Validate, update optimistically, then save after `delay` ms (0 = now). */
  function apply(nextMode: InputMode, nextText: string, delay: number) {
    clearTimeout(timer.current);
    const message = validateAmount(nextMode, nextText);
    setInvalid(message);
    if (message) return;
    const next = withAmount(holding, nextMode, nextText);
    sent.current = next;
    onChange(next);
    if (delay) timer.current = setTimeout(() => patch(next), delay);
    else patch(next);
  }

  function changeMode(next: InputMode) {
    setMode(next);
    apply(next, text, 0);
  }

  function changeText(next: string) {
    setText(next);
    apply(mode, next, DEBOUNCE_MS);
  }

  async function remove() {
    clearTimeout(timer.current);
    const restore = onRemove(holding);
    const res = await fetch(`/api/holdings/${holding.id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) onSaved();
    else restore();
  }

  return (
    <TableRow className="h-9 hover:bg-secondary">
      <TableCell className={`${CELL} font-mono font-semibold`}>{holding.ticker}</TableCell>
      <TableCell className={CELL}>
        <ModeToggle mode={mode} onChange={changeMode} locked={locked} />
      </TableCell>
      <TableCell className={CELL}>
        <Input
          value={text}
          onChange={(e) => changeText(e.target.value)}
          inputMode="decimal"
          aria-label={`${holding.ticker} amount`}
          aria-invalid={invalid ? true : undefined}
          className="h-7 rounded-[5px] border-transparent bg-transparent text-right font-mono text-[13px] tabular-nums hover:border-border focus-visible:border-primary focus-visible:ring-0 md:text-[13px] aria-invalid:ring-0 aria-invalid:focus-visible:border-destructive"
        />
      </TableCell>
      <TableCell className={`${CELL} ${busy ? DIM : FADE}`} aria-busy={busy || undefined}>
        {loaded ? <PriceCell price={price} /> : <Skeleton className={`${SKELETON} w-16`} />}
      </TableCell>
      <TableCell
        className={`${CELL} text-right font-mono tabular-nums ${busy ? DIM : FADE}`}
        aria-busy={busy || undefined}
      >
        {loaded ? totalValue(holding, price) : <Skeleton className={`${SKELETON} w-20`} />}
      </TableCell>
      <TableCell className={`${CELL} text-xs leading-4`} aria-live="polite">
        <RowStatus invalid={invalid} save={save} saveCount={saveCount} />
      </TableCell>
      <TableCell className={`${CELL} text-center`}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${holding.ticker}`}
          onClick={remove}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="size-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function RowStatus({ invalid, save, saveCount }: { invalid: string | null; save: Save; saveCount: number }) {
  if (invalid) return <span className="text-destructive">{invalid}</span>;
  if (save.state === 'saving')
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Saving
      </span>
    );
  if (save.state === 'saved')
    return (
      <span
        key={saveCount}
        className="inline-flex animate-out items-center gap-1 text-muted-foreground delay-2000 duration-200 fade-out fill-mode-forwards"
      >
        <Check className="size-3" />
        Saved
      </span>
    );
  if (save.state === 'error')
    return (
      <span className="text-destructive" title={save.error}>
        Not saved
      </span>
    );
  return null;
}

/** DOLLARS rows show their own amount (optimistic while editing); others the server value. */
function totalValue(holding: Holding, price?: AnalysisHolding) {
  if (holding.inputMode === 'DOLLARS' && holding.dollarAmount) return formatUsd(holding.dollarAmount);
  return price?.valueCents ? formatCents(price.valueCents) : EMPTY;
}

/** Stale chip tooltip: source and as-of time (D-18). */
function staleTitle(source: AnalysisHolding['source'], asOf: string) {
  return source === 'cache'
    ? `Cached price as of ${formatAsOfDateTime(asOf)}`
    : `Sample price as of ${formatAsOfDate(asOf)}`;
}

/** Price with optional NAV label and stale chip, as-of time underneath (D-17, D-18). */
function PriceCell({ price }: { price?: AnalysisHolding }) {
  if (!price?.livePrice) return <div className="text-right font-mono">{EMPTY}</div>;
  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-1 leading-4">
        {price.priceKind === 'NAV' && (
          <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">NAV</span>
        )}
        <span className="font-mono tabular-nums">{formatUsd(price.livePrice)}</span>
        {price.stale && price.asOf && (
          <Badge
            variant="outline"
            title={staleTitle(price.source, price.asOf)}
            className="h-4 rounded-[4px] bg-transparent px-1 py-0 text-[11px] leading-4 font-normal text-muted-foreground"
          >
            stale
          </Badge>
        )}
      </div>
      {price.asOf && <div className="text-[11px] leading-4 text-muted-foreground">{formatAsOf(price.asOf)}</div>}
    </div>
  );
}
