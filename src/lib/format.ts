const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const twoDp = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const timeZone = 'America/New_York';
const nyDay = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
const nyYear = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' });
const nyTime = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
const nyMonthDay = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' });
const nyFullDate = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' });
const utcFullDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Format a decimal dollar string for display only, e.g. '40000.00' -> '$40,000.00'. */
export function formatUsd(amount: string): string {
  return usd.format(Number(amount));
}

/** Integer cents string to a dollar string with string math, e.g. '5' -> '0.05'. */
export function centsToDollars(cents: string): string {
  const digits = cents.padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/** Format an integer cents string as USD, e.g. '4000000' -> '$40,000.00'. */
export function formatCents(cents: string): string {
  return formatUsd(centsToDollars(cents));
}

/** New York wall time, e.g. '4:00 PM ET' (ICU's narrow space normalized). */
function timeET(date: Date): string {
  return `${nyTime.format(date).replace(/\s/g, ' ')} ET`;
}

/** Compact as-of: time today, 'Nov 17' this year, 'Nov 17, 2025' before that (New York dates). */
export function formatAsOf(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (nyDay.format(date) === nyDay.format(now)) return timeET(date);
  if (nyYear.format(date) === nyYear.format(now)) return nyMonthDay.format(date);
  return nyFullDate.format(date);
}

/** Tooltip date-time, e.g. 'Nov 17, 4:00 PM ET'. */
export function formatAsOfDateTime(iso: string): string {
  const date = new Date(iso);
  return `${nyMonthDay.format(date)}, ${timeET(date)}`;
}

/** Tooltip date, e.g. 'Nov 14, 2026'. */
export function formatAsOfDate(iso: string): string {
  return nyFullDate.format(new Date(iso));
}

/** Holdings as-of date (YYYY-MM-DD) in UTC, e.g. 'Jun 30, 2026'; '—' for null. */
export function formatHoldingsDate(iso: string | null): string {
  return iso === null ? '—' : utcFullDate.format(new Date(iso));
}

/** Panel count label: '1 position' or '{n} positions'. */
export function positionsLabel(n: number): string {
  return n === 1 ? '1 position' : `${n} positions`;
}

/** Warning for holdings left out of the total, or null when every holding is priced. */
export function unpricedNote(tickers: string[]): string | null {
  if (tickers.length === 0) return null;
  if (tickers.length === 1) return '1 holding could not be priced and is excluded from the total';
  return `${tickers.length} holdings could not be priced and are excluded from the total`;
}

/** Filter count label: '{n} of {total} stocks', singular when total is 1. */
export function stocksLabel(n: number, total: number): string {
  return `${n} of ${total} ${total === 1 ? 'stock' : 'stocks'}`;
}

/** Market cap in $mil, 0 decimals, e.g. '210431.4' -> '$210,431'; '—' for null. */
export function formatMarketCapMil(s: string | null): string {
  return s === null ? '—' : usd0.format(Number(s));
}

/** Valuation ratio at 2dp, e.g. '24.126' -> '24.13'; '—' for null. */
export function formatRatio(s: string | null): string {
  return s === null ? '—' : twoDp.format(Number(s));
}

/** Expense ratio percent at 2dp, e.g. '0.0345' -> '0.03%'; '—' for null. */
export function formatExpensePct(s: string | null): string {
  return s === null ? '—' : `${twoDp.format(Number(s))}%`;
}

/** Years at 2dp, e.g. '6.1234' -> '6.12 yrs'; '—' for null. */
export function formatYears(s: string | null): string {
  return s === null ? '—' : `${twoDp.format(Number(s))} yrs`;
}
