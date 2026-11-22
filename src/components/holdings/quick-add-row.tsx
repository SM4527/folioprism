'use client';

import { useRef, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { InputMode } from '@/lib/engine/types';
import { canonicalTicker, isCashLike, TICKER_RE } from '@/lib/engine/ticker';
import { type HoldingRow, TICKER_MESSAGE, validateAmount } from '@/lib/holdings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
import { ModeToggle } from '@/components/holdings/mode-toggle';

const FIELD =
  'h-8 rounded-[5px] bg-card font-mono text-[13px] md:text-[13px] focus-visible:border-primary aria-invalid:ring-0 aria-invalid:focus-visible:border-destructive';

interface QuickAddRowProps {
  autoFocus: boolean;
  onAdded: (holding: HoldingRow, created: boolean) => void;
  onFailed: (ticker: string, error: string) => void;
}

interface Errors {
  ticker?: string;
  amount?: string;
}

/** Quick-add row: ticker, mode and amount; re-adding a ticker updates it, unknown tickers show inline (D-10, D-12, D-16). */
export function QuickAddRow({ autoFocus, onAdded, onFailed }: QuickAddRowProps) {
  const [ticker, setTicker] = useState('');
  const [mode, setMode] = useState<InputMode>('DOLLARS');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const tickerRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const canonical = canonicalTicker(ticker);
  const cash = isCashLike(canonical);
  const effectiveMode = cash ? 'DOLLARS' : mode;

  async function submit() {
    if (busy.current) return;
    const next: Errors = {
      ticker: TICKER_RE.test(canonical) ? undefined : TICKER_MESSAGE,
      amount: validateAmount(effectiveMode, amount) ?? undefined,
    };
    setErrors(next);
    if (next.ticker || next.amount) return;
    busy.current = true;
    setPending(true);
    const field = effectiveMode === 'SHARES' ? 'shares' : 'dollarAmount';
    const res = await fetch('/api/holdings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticker: canonical, inputMode: effectiveMode, [field]: amount }),
    }).catch(() => null);
    busy.current = false;
    setPending(false);
    if (res?.status === 400) {
      const error = (await res.json().catch(() => null))?.error ?? res.statusText;
      setErrors({ ticker: error });
      tickerRef.current?.focus();
      return;
    }
    if (!res?.ok) {
      const error = res ? ((await res.json().catch(() => null))?.error ?? res.statusText) : 'Network error';
      onFailed(canonical, error);
      return;
    }
    const { holding, created } = await res.json();
    onAdded(holding, created);
    setTicker('');
    setAmount('');
    setMode('DOLLARS');
    tickerRef.current?.focus();
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit();
  };

  return (
    <>
      <TableRow className="h-12 border-t bg-secondary hover:bg-secondary">
        <TableCell className="px-3 py-0">
          <Input
            ref={tickerRef}
            value={ticker}
            onChange={(e) => {
              setTicker(e.target.value.toUpperCase());
              setErrors((prev) => ({ ...prev, ticker: undefined }));
            }}
            onKeyDown={onKeyDown}
            placeholder="Ticker"
            aria-label="Ticker"
            aria-invalid={errors.ticker ? true : undefined}
            autoFocus={autoFocus}
            className={`${FIELD} font-semibold uppercase`}
          />
        </TableCell>
        <TableCell className="px-3 py-0">
          <ModeToggle mode={effectiveMode} onChange={setMode} locked={cash} className="border bg-card" />
        </TableCell>
        <TableCell className="px-3 py-0">
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={onKeyDown}
            inputMode="decimal"
            placeholder={effectiveMode === 'SHARES' ? 'Shares' : 'Amount'}
            aria-label="Amount"
            aria-invalid={errors.amount ? true : undefined}
            className={`${FIELD} text-right tabular-nums`}
          />
        </TableCell>
        <TableCell colSpan={4} className="px-3 py-0 text-right">
          <Button onClick={submit} disabled={pending} className="h-8 rounded-[5px] text-[13px] hover:bg-[#115E59]">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Add holding
          </Button>
        </TableCell>
      </TableRow>
      {(errors.ticker || errors.amount) && (
        <TableRow className="bg-secondary hover:bg-secondary">
          <TableCell colSpan={7} className="h-4 px-3 pt-0 pb-2 text-xs leading-4 text-destructive" role="alert">
            {[errors.ticker, errors.amount].filter(Boolean).join('. ')}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
