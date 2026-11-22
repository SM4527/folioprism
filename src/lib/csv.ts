import Decimal from 'decimal.js';
import { canonicalTicker, isCashLike, TICKER_RE } from './engine/ticker';
import { validateAmount } from './holdings';
import type { HoldingInput, InputMode } from './engine/types';

/**
 * A parsed holding plus the 1-based file line of its first occurrence.
 * pendingShares holds shares still to be priced when one ticker mixes share and dollar rows.
 */
export type CsvRow = HoldingInput & { line: number; pendingShares?: string };
export interface CsvSkip {
  line: number;
  reason: string;
}
export type CsvResult = { rows: CsvRow[]; skipped: CsvSkip[] } | { error: string };

const TICKER_COLS = new Set(['ticker', 'symbol']);
const SHARES_COLS = new Set(['shares', 'quantity', 'qty']);
const DOLLAR_COLS = new Set(['amount', 'value', 'market value', 'current value']);
const FOOTER_WORDS = new Set(['TOTAL', 'TOTALS']);
const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const NO_HEADER = 'No header row with a ticker column and an amount or shares column';

interface Header {
  index: number;
  ticker: number;
  shares: number;
  dollars: number;
}

/** Strip a leading BOM and split on LF or CRLF. */
export function splitLines(text: string): string[] {
  return text.replace(/^﻿/, '').split(/\r?\n/);
}

/** Split one line on commas, honoring double quotes and `""` escapes. */
export function splitCells(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted && ch === '"' && line[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

/** The first line with a ticker column plus a shares or dollars column (D-20). */
function findHeader(lines: string[]): Header | null {
  for (let index = 0; index < lines.length; index++) {
    const names = splitCells(lines[index]).map((c) => c.trim().toLowerCase());
    const ticker = names.findIndex((n) => TICKER_COLS.has(n));
    const shares = names.findIndex((n) => SHARES_COLS.has(n));
    const dollars = names.findIndex((n) => DOLLAR_COLS.has(n));
    if (ticker >= 0 && (shares >= 0 || dollars >= 0)) return { index, ticker, shares, dollars };
  }
  return null;
}

/** Strip `$`, commas and spaces; `(x)` becomes `-x`. */
function cleanAmount(raw: string): string {
  const s = raw.replace(/[$,\s]/g, '');
  return s.startsWith('(') && s.endsWith(')') ? `-${s.slice(1, -1)}` : s;
}

/** Drop trailing `*` (Fidelity `SPAXX**`) and canonicalize. */
function cleanTicker(raw: string): string {
  return canonicalTicker(raw.trim().replace(/\*+$/, ''));
}

/** Parse broker CSV text into holdings plus a report of skipped rows (D-19, D-20, D-21). */
export function parseHoldingsCsv(text: string): CsvResult {
  const lines = splitLines(text);
  const header = findHeader(lines);
  if (!header) return { error: NO_HEADER };
  const byTicker = new Map<string, CsvRow>();
  const skipped: CsvSkip[] = [];

  for (let i = header.index + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const line = i + 1;
    const cells = splitCells(lines[i]);
    const ticker = cleanTicker(cells[header.ticker] ?? '');
    if (!TICKER_RE.test(ticker) || FOOTER_WORDS.has(ticker)) {
      skipped.push({ line, reason: 'Invalid ticker' });
      continue;
    }
    const { inputMode, amount } = rowAmount(ticker, cells, header);
    const message = validateAmount(inputMode, amount);
    if (message) {
      skipped.push({ line, reason: message });
      continue;
    }
    const seen = byTicker.get(ticker);
    if (seen) addAmount(seen, inputMode, amount);
    else byTicker.set(ticker, { ticker, inputMode, ...field(inputMode, amount), line });
  }
  return { rows: [...byTicker.values()], skipped };
}

/** The mode and amount of one row; cash-like tickers are always dollars, a shares cell counting at $1.00 (D-09). */
function rowAmount(ticker: string, cells: string[], header: Header): { inputMode: InputMode; amount: string } {
  const shares = header.shares >= 0 ? cleanAmount(cells[header.shares] ?? '') : '';
  const dollars = header.dollars >= 0 ? cleanAmount(cells[header.dollars] ?? '') : '';
  if (isCashLike(ticker)) return { inputMode: 'DOLLARS', amount: NUMBER_RE.test(dollars) ? dollars : shares };
  const hasShares = NUMBER_RE.test(shares) || (shares !== '' && header.dollars < 0);
  return hasShares ? { inputMode: 'SHARES', amount: shares } : { inputMode: 'DOLLARS', amount: dollars };
}

function field(inputMode: InputMode, amount: string): Partial<CsvRow> {
  return inputMode === 'SHARES' ? { shares: amount } : { dollarAmount: amount };
}

const plus = (a: string | undefined, b: string) => new Decimal(a ?? 0).plus(b).toString();

/**
 * Sum a repeat row into the first one. When the modes differ, the row becomes DOLLARS
 * and its share parts move to pendingShares, priced at import.
 */
function addAmount(seen: CsvRow, inputMode: InputMode, amount: string) {
  if (seen.inputMode === inputMode && seen.pendingShares === undefined) {
    if (inputMode === 'SHARES') seen.shares = plus(seen.shares, amount);
    else seen.dollarAmount = plus(seen.dollarAmount, amount);
    return;
  }
  if (seen.inputMode === 'SHARES') {
    seen.pendingShares = seen.shares;
    delete seen.shares;
    seen.inputMode = 'DOLLARS';
  }
  if (inputMode === 'SHARES') seen.pendingShares = plus(seen.pendingShares, amount);
  else seen.dollarAmount = plus(seen.dollarAmount, amount);
}
