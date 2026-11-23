/**
 * Rebuild fund constituents from public issuer CSVs or each fund's latest SEC N-PORT filing.
 * Default (private): public plus data/local funds, results written only to gitignored data/local/.
 * --public: public funds only, written to the tracked data/mock-funds.json and data/cusip-tickers.json.
 * --allow-older: for this run only, let an older source replace a newer kept snapshot (printed per fund).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { canonicalTicker } from '../src/lib/engine/ticker';
import { figiIds, keptSnapshotBlocks, tickerLookup, toConstituents } from '../src/lib/refresh/constituents';
import { mapToTickers } from '../src/lib/refresh/figi';
import { formatFundsJson } from '../src/lib/refresh/funds-json';
import { issuerConstituents } from '../src/lib/refresh/issuer';
import { filingProblem, latestNportUrl, parseNport, type NportFiling } from '../src/lib/refresh/nport';
import { BREAKPOINTS_FILE, cutoffWeights, totalAgeLine, type Breakpoints } from '../src/lib/refresh/size-breakpoints';

type Fund = Record<string, unknown> & {
  holdingsAsOf?: string;
  holdingsSource?: string;
  constituents: { ticker: string; name: string; weightPct: number }[];
};

const PUBLIC = { funds: 'data/mock-funds.json', sources: 'data/fund-sources.json', cusips: 'data/cusip-tickers.json' };
const LOCAL = { funds: 'data/local/funds.json', sources: 'data/local/fund-sources.json', cusips: 'data/local/cusip-tickers.json' };

type Source = { nport?: string; csv?: string };
const USER_AGENT = process.env.SEC_USER_AGENT || 'FolioPrism refresh-funds/1.0 admin@example.com';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** GET from sec.gov with a declared User-Agent, sequential and paced well under 10 requests/second. */
async function secText(url: string): Promise<string> {
  if (!url.startsWith('https://www.sec.gov/')) throw new Error(`not a sec.gov URL: ${url}`);
  await sleep(200);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

/** GET a public https issuer file with the same User-Agent. */
async function issuerText(url: string): Promise<string> {
  if (!url.startsWith('https://')) throw new Error(`not an https URL: ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

const feeds = new Map<string, Promise<string | null>>();
const filings = new Map<string, Promise<NportFiling>>();

function filingUrl(id: string): Promise<string | null> {
  const feed = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(id)}&type=NPORT-P&dateb=&owner=include&count=10&output=atom`;
  if (!feeds.has(id)) feeds.set(id, secText(feed).then(latestNportUrl));
  return feeds.get(id)!;
}

function filing(url: string): Promise<NportFiling> {
  if (!filings.has(url)) filings.set(url, secText(url).then(parseNport));
  return filings.get(url)!;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** A JSON file, or {} when it does not exist (optional data/local files). */
function readOptional<T>(path: string): T {
  return (existsSync(path) ? readJson<T>(path) : {}) as T;
}

/** Write a CUSIP map sorted by key. */
function writeCache(path: string, cache: Record<string, string | null>): void {
  const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

/** Persists the CUSIP cache after each filing; set per mode in main. */
let saveCache: (cache: Record<string, string | null>) => void;

/** Display names already used for a ticker anywhere in the file (DEC-19). */
function nameMap(funds: Record<string, Fund>): Record<string, string> {
  const names: Record<string, string> = {};
  for (const f of Object.values(funds)) for (const c of f.constituents) names[c.ticker] ??= c.name;
  return names;
}

/** The fund with new holdings fields; holdingsAsOf and holdingsSource sit right after asOf. */
function replaced(fund: Fund, update: Pick<Fund, 'holdingsAsOf' | 'holdingsSource' | 'constituents'>): Fund {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fund)) {
    if (k === 'holdingsAsOf' || k === 'holdingsSource') continue;
    out[k] = k === 'constituents' ? update.constituents : v;
    if (k === 'asOf') Object.assign(out, { holdingsAsOf: update.holdingsAsOf, holdingsSource: update.holdingsSource });
  }
  return out as Fund;
}

/** A skip line; the kept-snapshot suffix is left off when the reason already names it. */
const skip = (ticker: string, reason: string, fund?: Fund) =>
  `${ticker.padEnd(7)}${'skipped'.padEnd(14)}${reason}${reason.includes('kept') ? '' : `, kept ${fund?.holdingsAsOf?.slice(0, 10) ?? 'undated'} snapshot`}`;

/** Output line for a refreshed fund. */
const done = (ticker: string, label: string, asOf: string, count: number, sumPct: string) =>
  `${ticker.padEnd(7)}${label.padEnd(14)}${asOf}    ${String(count).padStart(4)} holdings    sum ${Number(sumPct).toFixed(2)}%`;

/** Set by --allow-older for this run only: an older source may replace a newer kept snapshot. Never the default. */
let allowOlder = false;

/** The skip reason when the kept full-list snapshot is newer than the source (DEC-17), unless --allow-older. */
const olderThanKept = (fund: Fund, asOf: string) =>
  keptSnapshotBlocks(fund, asOf) && !allowOlder ? `source dated ${asOf} is older than the kept ${fund.holdingsAsOf!.slice(0, 10)} snapshot` : null;

/** The output line: says so explicitly when --allow-older replaces a newer kept snapshot with an older source. */
function outLine(ticker: string, fund: Fund, [label, short]: [string, string], asOf: string, count: number, sumPct: string): string {
  if (!keptSnapshotBlocks(fund, asOf)) return done(ticker, label, asOf, count, sumPct);
  const kept = `${fund.holdingsAsOf!.slice(0, 10)} snapshot (${fund.constituents.length} holdings)`;
  return `${ticker}: replacing ${kept} with older ${asOf} ${short} (${count} holdings) because --allow-older`;
}

type Outcome = { line: string; update: Pick<Fund, 'holdingsAsOf' | 'holdingsSource' | 'constituents'> } | { reason: string };

async function fromNport(ticker: string, id: string, fund: Fund, cache: Record<string, string | null>, names: Record<string, string>): Promise<Outcome> {
  const url = await filingUrl(id);
  if (!url) return { reason: 'source unreachable (no NPORT-P filing listed)' };
  const nport = await filing(url);
  const problem = filingProblem(nport, id);
  if (problem) return { reason: problem };
  const { repPdDate, holdings } = nport;
  const older = olderThanKept(fund, repPdDate);
  if (older) return { reason: older };
  await mapToTickers(figiIds(holdings, cache), cache);
  // second pass: ISINs of rows whose CUSIP has no US ticker
  await mapToTickers(figiIds(holdings, cache), cache);
  saveCache(cache);
  const { constituents, sumPct } = toConstituents(holdings, tickerLookup(cache), names);
  if (constituents.length === 0) return { reason: 'no mapped equity holdings' };
  if (Number(sumPct) > 100) return { reason: `weights sum to ${Number(sumPct).toFixed(2)}%, above 100%` };
  return {
    line: outLine(ticker, fund, ['SEC N-PORT', 'N-PORT'], repPdDate, constituents.length, sumPct),
    update: { constituents, holdingsSource: url, holdingsAsOf: `${repPdDate}T00:00:00Z` },
  };
}

async function fromIssuer(ticker: string, url: string, fund: Fund, names: Record<string, string>): Promise<Outcome> {
  const result = issuerConstituents(await issuerText(url), names);
  if ('skip' in result) return { reason: result.skip };
  const older = olderThanKept(fund, result.asOf);
  if (older) return { reason: older };
  return {
    line: outLine(ticker, fund, ['Issuer file', 'issuer file'], result.asOf, result.constituents.length, result.sumPct),
    update: { constituents: result.constituents, holdingsSource: url, holdingsAsOf: `${result.asOf}T00:00:00Z` },
  };
}

/** Refresh one fund in place; returns its output line and whether it was updated. */
async function refresh(
  ticker: string,
  funds: Record<string, Fund>,
  sources: Record<string, Source>,
  cache: Record<string, string | null>,
  names: Record<string, string>,
): Promise<[string, boolean]> {
  const fund = funds[ticker];
  const source = sources[ticker] ?? {};
  if (!fund) return [`${ticker.padEnd(7)}${'skipped'.padEnd(14)}not a curated fund`, false];
  if (!source.nport && !source.csv) return [skip(ticker, 'no public source configured', fund), false];
  try {
    const out = source.csv ? await fromIssuer(ticker, source.csv, fund, names) : await fromNport(ticker, source.nport!, fund, cache, names);
    if ('reason' in out) return [skip(ticker, out.reason, fund), false];
    funds[ticker] = replaced(fund, out.update);
    return [out.line, true];
  } catch (err) {
    return [skip(ticker, `source unreachable (${(err as Error).message})`, fund), false];
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const isPublic = argv.includes('--public');
  allowOlder = argv.includes('--allow-older');
  const publicFunds = readJson<Record<string, Fund>>(PUBLIC.funds);
  const publicCache = readJson<Record<string, string | null>>(PUBLIC.cusips);
  const localFunds = isPublic ? {} : readOptional<Record<string, Fund>>(LOCAL.funds);
  const funds = { ...publicFunds, ...localFunds };
  const sources = {
    ...readJson<Record<string, Source>>(PUBLIC.sources),
    ...(isPublic ? {} : readOptional<Record<string, Source>>(LOCAL.sources)),
  };
  const cache = { ...publicCache, ...(isPublic ? {} : readOptional<Record<string, string | null>>(LOCAL.cusips)) };
  if (isPublic) saveCache = (c) => writeCache(PUBLIC.cusips, c);
  else {
    mkdirSync('data/local', { recursive: true });
    saveCache = (c) => writeCache(LOCAL.cusips, Object.fromEntries(Object.entries(c).filter(([k]) => !(k in publicCache))));
  }
  const names = nameMap(funds);
  const args = argv.filter((a) => !a.startsWith('--')).map(canonicalTicker);
  const tickers = args.length ? args : Object.keys(funds).filter((t) => funds[t].constituents.length > 0);

  const updated: string[] = [];
  for (const ticker of tickers) {
    const [line, ok] = await refresh(ticker, funds, sources, cache, names);
    console.log(line);
    if (ok) updated.push(ticker);
  }
  const target = isPublic ? PUBLIC.funds : LOCAL.funds;
  const before = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const kept = isPublic ? funds : { ...localFunds, ...Object.fromEntries(updated.map((t) => [t, funds[t]])) };
  const out = formatFundsJson(kept);
  if (out !== before) writeFileSync(target, out);
  console.log(`Updated ${updated.length} of ${tickers.length} funds in ${target}`);
  console.log(isPublic ? updateBreakpoints(kept.VTI) : totalAgeLine(readJson<Breakpoints>(BREAKPOINTS_FILE), new Date()));
}

/** Recompute the size cut-off weights from VTI's N-PORT holdings; the hand-entered US market total is kept. */
function updateBreakpoints(vti: Fund): string {
  const b = readJson<Breakpoints>(BREAKPOINTS_FILE);
  const weights = cutoffWeights(vti.constituents);
  const next: Breakpoints = { ...b, ...weights, weightsAsOf: vti.holdingsAsOf?.slice(0, 10) ?? b.weightsAsOf };
  writeFileSync(BREAKPOINTS_FILE, JSON.stringify(next, null, 1) + '\n');
  return totalAgeLine(next, new Date());
}

main();
