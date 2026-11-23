/**
 * Write data/stock-facts.sample.json: SYNTHETIC stock facts for the sample stack and tests, never Yahoo data.
 * Tickers: the top 200 holdings of each sample fund. Market cap: the stock's weight in a cap-weighted public fund
 * (from data/mock-funds.json, SEC N-PORT) times a fixed fund total. P/E, P/B and dividend yield: seeded
 * pseudo-random values in realistic ranges, so value/growth in sample screenshots is illustrative only.
 *
 *   npx tsx scripts/make-sample-facts.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SAMPLE_FUNDS = ['VTI', 'FXAIX', 'QQQ', 'SCHD', 'SPY'];
const TOP = 200;
/** Fixed total market caps in $mil for the cap-weighted funds used to size stocks, in lookup order. */
const CAP_TOTALS_MIL: [string, number][] = [
  ['VTI', 60_000_000],
  ['FXAIX', 52_000_000],
  ['QQQ', 32_000_000],
];
const FALLBACK_CAP_MIL = 5_000;

type Fund = { constituents: { ticker: string; weightPct: number }[] };
const funds: Record<string, Fund> = JSON.parse(readFileSync('data/mock-funds.json', 'utf8'));

/** FNV-1a hash of the ticker seeds a small deterministic generator. */
function random(ticker: string): () => number {
  let h = 2166136261;
  for (const ch of ticker) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const round = (n: number, dp: number) => Number(n.toFixed(dp));
const logUniform = (r: number, lo: number, hi: number) => lo * (hi / lo) ** r;

function marketCapMil(ticker: string): number {
  for (const [fund, total] of CAP_TOTALS_MIL) {
    const c = funds[fund].constituents.find((x) => x.ticker === ticker);
    if (c) return round((c.weightPct / 100) * total, 0);
  }
  return FALLBACK_CAP_MIL;
}

const tickers = new Set(
  SAMPLE_FUNDS.flatMap((f) =>
    funds[f].constituents
      .slice()
      .sort((a, b) => b.weightPct - a.weightPct)
      .slice(0, TOP)
      .map((c) => c.ticker),
  ),
);

const facts = Object.fromEntries(
  [...tickers].sort().map((t) => {
    const next = random(t);
    const pays = next() > 0.25;
    return [
      t,
      {
        marketCapMil: marketCapMil(t),
        pe: round(logUniform(next(), 8, 60), 2),
        pb: round(logUniform(next(), 0.8, 20), 2),
        divYieldPct: pays ? round(next() * 4, 2) : 0,
      },
    ];
  }),
);

writeFileSync('data/stock-facts.sample.json', JSON.stringify(facts, null, 1) + '\n');
console.log(`stock-facts.sample.json: ${tickers.size} synthetic entries`);
