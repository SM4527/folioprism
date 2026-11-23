/** Reads a file's text, or null when it does not exist. */
export type ReadFile = (path: string) => string | null;

export const PUBLIC_FUNDS = 'data/mock-funds.json';
export const LOCAL_FUNDS = 'data/local/funds.json';
export const LOCAL_STOCKS = 'data/local/stocks.json';
export const FACTS_OUT = 'data/local/stock-facts.json';

type Funds = Record<string, { constituents?: { ticker: string; weightPct: number }[] }>;

const parse = <T>(read: ReadFile, path: string): T | null => {
  const text = read(path);
  return text === null ? null : (JSON.parse(text) as T);
};

const constituentTickers = (funds: Funds | null) =>
  Object.values(funds ?? {}).flatMap((f) => (f.constituents ?? []).map((c) => c.ticker));

/**
 * The tickers to fetch facts for, sorted and unique. By default only the public curated funds'
 * constituents; personal files under data/local are opened only with includeLocal (--include-local).
 */
export function factsTickers(read: ReadFile, includeLocal: boolean): string[] {
  const tickers = constituentTickers(parse<Funds>(read, PUBLIC_FUNDS));
  if (includeLocal) {
    tickers.push(...constituentTickers(parse<Funds>(read, LOCAL_FUNDS)));
    tickers.push(...Object.keys(parse<Record<string, unknown>>(read, LOCAL_STOCKS) ?? {}));
  }
  return [...new Set(tickers)].sort();
}

/** Percent of a fund's constituent weight that has facts, to 0dp. */
export function coveragePct(fund: Funds[string], facts: Record<string, unknown>): number {
  const all = fund.constituents ?? [];
  const total = all.reduce((s, c) => s + c.weightPct, 0);
  const covered = all.filter((c) => c.ticker in facts).reduce((s, c) => s + c.weightPct, 0);
  return total === 0 ? 0 : Math.round((100 * covered) / total);
}
