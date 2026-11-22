import { centsToDollars } from './format';
import type { SerializedRow } from './engine/types';

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;
const HEADER = 'level,ticker,name,fund_weight_pct,portfolio_pct,market_value';
const CRLF = '\r\n';

/** Make a text cell safe for spreadsheets: `'` before a formula start, then RFC 4180 quoting (D-24). */
export function escapeCsvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** One CSV line; text cells are escaped, numeric cells are written as-is. */
function line(level: string, ticker: string, name: string, fundPct: string, pct: string, cents: string): string {
  return [level, escapeCsvCell(ticker), escapeCsvCell(name), fundPct, pct, centsToDollars(cents)].join(',');
}

/** The full Top 50 as CSV: each `stock` line followed by its `source` lines, CRLF-terminated (D-24). */
export function intersectionCsv(rows: SerializedRow[]): string {
  const lines = [HEADER];
  for (const row of rows) {
    lines.push(line('stock', row.ticker, row.name, '', row.portfolioPct, row.valueCents));
    for (const c of row.children) {
      lines.push(line('source', c.sourceTicker, c.sourceName, c.fundWeightPct, c.portfolioPct, c.valueCents));
    }
  }
  return lines.join(CRLF) + CRLF;
}

/** `folioprism-intersection-YYYY-MM-DD.csv` for the local date. */
export function exportFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `folioprism-intersection-${day}.csv`;
}
