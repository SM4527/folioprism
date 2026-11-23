/**
 * Fetch stock facts (market cap, P/E, P/B, dividend yield) from Yahoo's batched quote call and write them to
 * the gitignored data/local/stock-facts.json, which only the personal stack reads. Yahoo data is never committed.
 *
 *   npx tsx scripts/refresh-stock-facts.ts                   public curated funds' constituents only
 *   npx tsx scripts/refresh-stock-facts.ts --include-local   also data/local/funds.json and data/local/stocks.json
 *
 * Prints counts and coverage percentages only: public funds by ticker, personal funds as an aggregate.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchYahooFacts } from '../src/lib/market/yahoo';
import { coveragePct, FACTS_OUT, factsTickers, LOCAL_FUNDS, PUBLIC_FUNDS, type ReadFile } from '../src/lib/refresh/stock-facts';

const read: ReadFile = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
const includeLocal = process.argv.includes('--include-local');

const tickers = factsTickers(read, includeLocal);
const { facts, failedBatches } = await fetchYahooFacts(tickers);
const sorted = Object.fromEntries(Object.entries(facts).sort(([a], [b]) => (a < b ? -1 : 1)));
mkdirSync('data/local', { recursive: true });
writeFileSync(FACTS_OUT, JSON.stringify(sorted, null, 1) + '\n');

console.log(`stock facts: ${Object.keys(facts).length} of ${tickers.length} tickers, ${failedBatches} failed batch(es) -> ${FACTS_OUT}`);
const publicFunds = JSON.parse(read(PUBLIC_FUNDS)!);
for (const [t, f] of Object.entries(publicFunds)) console.log(`  ${t.padEnd(6)} ${coveragePct(f as never, facts)}%`);
if (includeLocal) {
  const local = Object.values(JSON.parse(read(LOCAL_FUNDS) ?? '{}')).map((f) => coveragePct(f as never, facts));
  const below = local.filter((p) => p < 60).length;
  console.log(`  personal funds: ${local.length}, ${below} below 60% coverage (they keep the one-cell estimate)`);
}
if (failedBatches > 0) process.exitCode = 1;
