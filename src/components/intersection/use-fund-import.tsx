'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Decimal from 'decimal.js';
import type { NoticeState } from '@/components/holdings/notice';
import type { CsvSkip } from '@/lib/csv';
import { formatHoldingsDate } from '@/lib/format';

export interface FundImportResult {
  ticker: string;
  count: number;
  asOf: string;
  asOfFromFile: boolean;
  sumPct: string;
  skipped: CsvSkip[];
}

export interface FundBusy {
  ticker: string;
  action: 'upload' | 'remove';
}

const NOTICE_MS = 4000;
const SHOWN_SKIPS = 5;

const url = (ticker: string) => `/api/funds/${encodeURIComponent(ticker)}/holdings`;

/** Notice lines for a fund holdings import (04.1-UI-SPEC Copywriting Contract). */
function importedLines({ ticker, count, asOf, sumPct, skipped }: FundImportResult) {
  const more = skipped.length - SHOWN_SKIPS;
  return (
    <>
      <p>
        Imported {count} holdings for {ticker}, as of {formatHoldingsDate(asOf)}. Weights sum to{' '}
        {new Decimal(sumPct).toFixed(1)}%.
      </p>
      {skipped.length > 0 && (
        <>
          <p>Skipped {skipped.length} rows:</p>
          <ul className="font-mono text-xs">
            {skipped.slice(0, SHOWN_SKIPS).map((s) => (
              <li key={s.line}>
                Line {s.line}: {s.reason}
              </li>
            ))}
          </ul>
          {more > 0 && <p>and {more} more</p>}
        </>
      )}
    </>
  );
}

const errorNotice = (text: string): NoticeState => ({ kind: 'error', lines: <p>{text}</p> });

/** Upload or remove one fund's issuer holdings CSV, one request at a time (DEC-11, DEC-12). */
export function useFundImport(onChanged: () => void) {
  const input = useRef<HTMLInputElement>(null);
  const target = useRef('');
  const focusAfter = useRef<string | null>(null);
  const [busy, setBusy] = useState<FundBusy | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  useEffect(() => {
    if (!notice?.autoDismiss) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (busy || !focusAfter.current) return;
    const button = document.querySelector<HTMLButtonElement>(
      `[data-fund="${focusAfter.current}"] [data-action="import"]`,
    );
    focusAfter.current = null;
    button?.focus();
  }, [busy]);

  function pick(ticker: string) {
    target.current = ticker;
    input.current?.click();
  }

  async function upload(ticker: string, file: File) {
    setBusy({ ticker, action: 'upload' });
    try {
      const res = await fetch(url(ticker), {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: await file.text(),
      });
      const body = await res.json();
      if (res.ok) {
        onChanged();
        setNotice({ kind: 'info', lines: importedLines(body), autoDismiss: body.skipped.length === 0 });
      } else {
        setNotice(
          errorNotice(
            `Import failed for ${ticker}: ${body.error}. The file needs a header row with a ticker column and a weight column, with weights in percent.`,
          ),
        );
      }
    } catch {
      setNotice(
        errorNotice(
          `Import failed for ${ticker}: the app could not be reached. Check that the app is running, then try again.`,
        ),
      );
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(ticker: string) {
    setBusy({ ticker, action: 'remove' });
    const res = await fetch(url(ticker), { method: 'DELETE' }).catch(() => null);
    if (res?.status === 204) {
      onChanged();
      setNotice(null);
      focusAfter.current = ticker;
    } else {
      setNotice(
        errorNotice(`Could not remove imported holdings for ${ticker}. Check that the app is running, then try again.`),
      );
    }
    setBusy(null);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload(target.current, file);
  }

  const inputProps = { ref: input, type: 'file', accept: '.csv,text/csv', className: 'hidden', onChange };
  return { inputProps, pick, remove, busy, notice, dismiss: () => setNotice(null) };
}
