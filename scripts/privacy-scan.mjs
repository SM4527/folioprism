#!/usr/bin/env node
/**
 * Private-ticker scanner. The ticker list is read at run time from gitignored data/local/ and never printed.
 * Private tickers: top-level keys of data/local/{funds,stocks,fund-sources}.json plus data/local/cash.json,
 * minus any ticker in the public data/mock-funds.json (fund or constituent).
 *
 *   node scripts/privacy-scan.mjs push <rev-range...>   added lines and messages of the commits in the range
 *   node scripts/privacy-scan.mjs dir <path>            every file under a directory (for example a built app)
 *
 * Prints file:line for each hit (never the ticker) and exits 1 when anything matches.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const LOCAL = 'data/local';

function readJson(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

/** Every ticker in the public fund data: fund keys and constituent tickers. */
function publicTickers(fundsJson) {
  const funds = JSON.parse(fundsJson);
  const out = new Set(Object.keys(funds));
  for (const f of Object.values(funds)) for (const c of f.constituents ?? []) out.add(c.ticker);
  return out;
}

/** The private ticker list, read from data/local and filtered against the public data. */
export function privateTickers(publicFundsJson) {
  const keys = ['funds.json', 'stocks.json', 'fund-sources.json'].flatMap((f) => Object.keys(readJson(path.join(LOCAL, f)) ?? {}));
  const cash = readJson(path.join(LOCAL, 'cash.json')) ?? [];
  const pub = publicTickers(publicFundsJson);
  return [...new Set([...keys, ...cash])].filter((t) => !pub.has(t));
}

const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A case-sensitive whole-word matcher for the tickers, or null when there are none. */
function matcher(tickers) {
  if (tickers.length === 0) return null;
  return new RegExp(`(?<![A-Za-z0-9.])(?:${tickers.map(escape).join('|')})(?![A-Za-z0-9])`);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 30 });

/** Hits in the added lines and commit messages of the commits in a rev range. */
function scanPush(range) {
  const tip = git('rev-list', '-1', ...range).trim();
  if (!tip) return [];
  const re = matcher(privateTickers(git('show', `${tip}:data/mock-funds.json`)));
  if (!re) return [];
  const hits = [];
  for (const sha of git('rev-list', ...range).split('\n').filter(Boolean)) {
    git('log', '-1', '--format=%B', sha).split('\n').forEach((l, i) => re.test(l) && hits.push(`commit ${sha.slice(0, 7)} message:${i + 1}`));
    let file = '';
    let line = 0;
    for (const l of git('show', '--format=', '-U0', '--no-color', sha).split('\n')) {
      if (l.startsWith('+++ ')) file = l.slice(6);
      else if (l.startsWith('@@')) line = Number(/\+(\d+)/.exec(l)[1]);
      else if (l.startsWith('+')) {
        if (re.test(l.slice(1))) hits.push(`commit ${sha.slice(0, 7)} ${file}:${line}`);
        line++;
      }
    }
  }
  return hits;
}

/** Hits in every text file under a directory; binary files (with a NUL byte) are skipped. */
function scanDir(dir) {
  const re = matcher(privateTickers(readFileSync('data/mock-funds.json', 'utf8')));
  if (!re) return [];
  const hits = [];
  const walk = (p) => {
    if (statSync(p).isDirectory()) return readdirSync(p).forEach((n) => walk(path.join(p, n)));
    const text = readFileSync(p, 'utf8');
    if (text.includes('\0')) return;
    text.split('\n').forEach((l, i) => re.test(l) && hits.push(`${p}:${i + 1}`));
  };
  walk(dir);
  return hits;
}

/**
 * Exit 2 on any failure so callers can tell an error from a hit (exit 1). Git errors name the command;
 * other errors print only their type, since a JSON parse message can quote private file content.
 */
function fail(error) {
  const detail = error.status !== undefined ? error.message.split('\n')[0] : error.name;
  console.error(`privacy-scan: error, scan did not run: ${detail}`);
  process.exit(2);
}

function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const hits = mode === 'push' ? scanPush(rest) : mode === 'dir' ? scanDir(rest[0]) : null;
  if (hits === null) {
    console.error('usage: privacy-scan.mjs push <rev-range...> | dir <path>');
    process.exit(2);
  }
  for (const h of hits) console.error(`private ticker: ${h}`);
  console.log(`privacy-scan: ${hits.length} hit(s)`);
  process.exit(hits.length ? 1 : 0);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    fail(error);
  }
}
