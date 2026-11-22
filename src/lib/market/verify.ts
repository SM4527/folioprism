import type { QuoteResult } from './types';

/** The user-facing reason a ticker cannot be added, or null when it resolved (D-12). */
export function tickerError(ticker: string, result: QuoteResult): string | null {
  if (result.status === 'unknown') return `Unknown ticker ${ticker}`;
  if (result.status === 'unreachable') return `Could not verify ${ticker} right now. Try again in a minute.`;
  if (result.quote.currency !== 'USD') return `Only USD-listed tickers are supported (${ticker} is in ${result.quote.currency})`;
  return null;
}
