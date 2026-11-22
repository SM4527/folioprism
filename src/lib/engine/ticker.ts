/** Share classes merged under one ticker when mergeShareClasses is on (D-15). */
export const SHARE_CLASS_MAP: Record<string, string> = { GOOG: 'GOOGL', 'BRK.A': 'BRK.B' };

/** Trim, uppercase and map `-` and `/` to `.` (D-14). */
export function canonicalTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/[-/]/g, '.');
}

/** The ticker a stock is grouped under in the intersection. */
export function groupTicker(ticker: string, merge: boolean): string {
  return merge ? (SHARE_CLASS_MAP[ticker] ?? ticker) : ticker;
}

/** Money-market funds counted as cash and priced at a fixed $1.00 NAV (D-09). */
export const MONEY_MARKET = new Set(['SPAXX', 'FDRXX', 'VMFXX', 'SWVXX', 'SPRXX']);

/** A canonical ticker: 1-12 letters, digits or dots (D-08). */
export const TICKER_RE = /^[A-Z0-9.]{1,12}$/;

/** True for CASH and money-market tickers. */
export function isCashLike(ticker: string): boolean {
  return ticker === 'CASH' || MONEY_MARKET.has(ticker);
}
