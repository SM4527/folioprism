import Decimal from 'decimal.js';
import { splitCells, splitLines, type CsvSkip } from './csv';
import { canonicalTicker, isCashLike, TICKER_RE } from './engine/ticker';
import type { Constituent } from './engine/types';

/** Imported weights may not sum above 100, the same rule as the refresh path. */
export const MAX_SUM_PCT = 100;

export type FundCsvResult =
  | { constituents: Constituent[]; skipped: CsvSkip[]; asOf: string | null; sumPct: string }
  | { error: string };

const TICKER_COLS = new Set(['ticker', 'symbol', 'holding ticker', 'stock ticker', 'ticker symbol']);
const WEIGHT_COLS = new Set([
  'weight', 'weight (%)', 'weight(%)', 'weight %', '% weight', 'weighting',
  '% of net assets', '% of fund', '% of funds', 'percent of fund', 'portfolio weight',
]);
const NAME_COLS = new Set(['name', 'holding', 'holding name', 'security name', 'security', 'description', 'company']);
const DATE_COLS = new Set(['as of date', 'as of', 'date']);
const ALIASES: Record<string, string> = { BRKB: 'BRK.B', BFB: 'BF.B' };
const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

interface FundHeader {
  index: number;
  ticker: number;
  weight: number;
  name: number;
  assetClass: number;
  date: number;
}

const normalize = (cell: string) => cell.trim().toLowerCase().replace(/\s+/g, ' ');

/** The first line with a ticker column and a weight column (DEC-07). */
function findFundHeader(lines: string[]): FundHeader | null {
  for (let index = 0; index < lines.length; index++) {
    const names = splitCells(lines[index]).map(normalize);
    const col = (set: Set<string>) => names.findIndex((n) => set.has(n));
    const ticker = col(TICKER_COLS);
    const weight = col(WEIGHT_COLS);
    if (ticker >= 0 && weight >= 0) {
      return { index, ticker, weight, name: col(NAME_COLS), assetClass: names.indexOf('asset class'), date: col(DATE_COLS) };
    }
  }
  return null;
}

/** `YYYY-MM-DD` for a valid calendar date, else null. */
function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** Parse `YYYY-MM-DD`, `M/D/YYYY` or `Mon D, YYYY` to `YYYY-MM-DD` in UTC (DEC-08). */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return isoDate(+m[3], +m[1], +m[2]);
  m = /^([A-Za-z]{3,9})\.? (\d{1,2}), (\d{4})$/.exec(s);
  const month = m ? MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) : -1;
  return m && month >= 0 ? isoDate(+m[3], month + 1, +m[2]) : null;
}

/**
 * The date in a preamble `as of` cell (rest of the cell, rest of the line for an unquoted `Mon D, YYYY`,
 * or the next non-empty cell), else the first row's date column.
 */
function findAsOf(lines: string[], header: FundHeader): string | null {
  for (const line of lines.slice(0, header.index)) {
    const cells = splitCells(line);
    const at = cells.findIndex((c) => /as of/i.test(c));
    if (at < 0) continue;
    const rest = cells[at].replace(/^.*?as of:?/i, '');
    const unquoted = [rest, ...cells.slice(at + 1)].join(',');
    const next = cells.slice(at + 1).find((c) => c.trim() !== '') ?? '';
    const date = parseDate(rest) ?? parseDate(unquoted) ?? parseDate(next);
    if (date) return date;
  }
  const first = lines.slice(header.index + 1).find((l) => l.trim() !== '');
  return header.date >= 0 && first ? parseDate(splitCells(first)[header.date] ?? '') : null;
}

/** Strip `%` and spaces; a comma is never valid in a percent weight, so it is left to fail the number check. */
const cleanWeight = (raw: string) => raw.replace(/[%\s]/g, '');

/** Canonical ticker with issuer share-class spellings aliased (DEC-09). */
function cleanTicker(raw: string): string {
  const ticker = canonicalTicker(raw);
  return ALIASES[ticker] ?? ticker;
}

/** A skip reason for a row's ticker or weight, or null when both are valid. */
function rowError(ticker: string, weight: string): string | null {
  if (ticker === '') return 'missing ticker';
  if (!TICKER_RE.test(ticker)) return 'invalid ticker';
  if (isCashLike(ticker)) return 'cash is not a stock';
  if (!NUMBER_RE.test(weight)) return 'weight is not a number';
  const w = new Decimal(weight);
  return w.lte(0) || w.gt(100) ? 'weight must be above 0 and at most 100' : null;
}

/** Parse an issuer holdings CSV into constituents, skipped rows and its as-of date (DEC-07, DEC-08, DEC-09). */
export function parseFundHoldingsCsv(text: string): FundCsvResult {
  const lines = splitLines(text);
  const header = findFundHeader(lines);
  if (!header) return { error: 'no header row with a ticker column and a weight column' };
  const byTicker = new Map<string, { name: string; weight: Decimal }>();
  const skipped: CsvSkip[] = [];

  for (let i = header.index + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const cells = splitCells(lines[i]);
    if (header.assetClass >= 0 && !/equity|stock/i.test(cells[header.assetClass] ?? '')) continue;
    const ticker = cleanTicker(cells[header.ticker] ?? '');
    const weight = cleanWeight(cells[header.weight] ?? '');
    const reason = rowError(ticker, weight);
    if (reason) {
      skipped.push({ line: i + 1, reason });
      continue;
    }
    const seen = byTicker.get(ticker);
    if (seen) seen.weight = seen.weight.plus(weight);
    else byTicker.set(ticker, { name: (cells[header.name] ?? '').trim() || ticker, weight: new Decimal(weight) });
  }

  if (byTicker.size === 0) return { error: 'no rows with a ticker and a weight' };
  const sum = Decimal.sum(...[...byTicker.values()].map((v) => v.weight));
  if (sum.gt(MAX_SUM_PCT)) return { error: `weights sum to ${sum.toFixed(1)}%, above ${MAX_SUM_PCT}%` };
  const constituents = [...byTicker].map(([ticker, v]) => ({ ticker, name: v.name, weightPct: v.weight.toFixed() }));
  return { constituents, skipped, asOf: findAsOf(lines, header), sumPct: sum.toFixed() };
}
