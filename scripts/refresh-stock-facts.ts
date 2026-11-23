/**
 * Fetch stock facts (market cap, P/E, P/B, dividend yield) from Yahoo's batched quote call and write them to
 * the gitignored data/local/stock-facts.json, which only the personal stack reads. Yahoo data is never committed.
 *
 *   npx tsx scripts/refresh-stock-facts.ts                   public curated funds' constituents only
 *   npx tsx scripts/refresh-stock-facts.ts --include-local   also data/local/funds.json and data/local/stocks.json
 *   npx tsx scripts/refresh-stock-facts.ts --dry-run         count the tickers only: no network, nothing written
 *
 * Prints counts and coverage percentages only: public funds by ticker, personal funds as an aggregate.
 * Exit codes: 0 done, 1 a batch or the run failed, 2 unknown option.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchYahooFacts } from '../src/lib/market/yahoo';
import { BREAKPOINTS_FILE, totalAgeLine } from '../src/lib/refresh/size-breakpoints';
import { coveragePct, FACTS_OUT, factsTickers, LOCAL_FUNDS, PUBLIC_FUNDS, type ReadFile } from '../src/lib/refresh/stock-facts';

const OPTIONS = ['--include-local', '--dry-run', '--help'];
const USAGE = 'usage: npx tsx scripts/refresh-stock-facts.ts [--include-local] [--dry-run] [--help]';

const read: ReadFile = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const unknown = argv.filter((a) => !OPTIONS.includes(a));
  if (argv.includes('--help') || unknown.length > 0) {
    if (unknown.length > 0) console.error(`unknown option: ${unknown.join(' ')}`);
    console.log(USAGE);
    return unknown.length > 0 ? 2 : 0;
  }
  const includeLocal = argv.includes('--include-local');
  const tickers = factsTickers(read, includeLocal);
  if (argv.includes('--dry-run')) {
    console.log(`dry run: would fetch ${tickers.length} tickers and write ${FACTS_OUT}; no network calls, nothing written`);
    return 0;
  }

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
  console.log(totalAgeLine(JSON.parse(read(BREAKPOINTS_FILE)!), new Date()));
  return failedBatches > 0 ? 1 : 0;
}

main().then(
  (code) => (process.exitCode = code),
  (error: Error) => {
    // A JSON parse message can quote file content (data/local), so a SyntaxError prints only its type.
    console.error(`refresh-stock-facts failed: ${error instanceof SyntaxError ? 'SyntaxError (a data file is not valid JSON)' : error.message}`);
    process.exitCode = 1;
  },
);
