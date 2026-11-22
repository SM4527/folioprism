import Decimal from 'decimal.js';
import { canonicalTicker, TICKER_RE } from '../engine/ticker';
import type { IdType } from './figi';
import type { NportHolding } from './nport';

export interface Constituent { ticker: string; name: string; weightPct: number }

const NUMBER_RE = /^-?\d+(\.\d+)?(E[-+]?\d+)?$/i;

/** A positive, finite equity (EC) row: the only rows that can become constituents. */
function isEquity(h: NportHolding): boolean {
  return h.assetCat === 'EC' && NUMBER_RE.test(h.pctVal) && new Decimal(h.pctVal).gt(0);
}

function ownTicker(h: NportHolding): string | null {
  const t = h.ticker && canonicalTicker(h.ticker);
  return t && TICKER_RE.test(t) ? t : null;
}

/**
 * Identifiers to map through OpenFIGI for equity rows without their own ticker: the CUSIP,
 * or the ISIN once the CUSIP is known to have no US ticker (foreign-domiciled issuers).
 */
export function figiIds(holdings: NportHolding[], known: Record<string, string | null>): { key: string; idType: IdType }[] {
  return holdings.filter((h) => isEquity(h) && !ownTicker(h)).flatMap((h): { key: string; idType: IdType }[] => {
    if (h.cusip && known[h.cusip] !== null) return [{ key: h.cusip, idType: 'ID_CUSIP' }];
    return h.isin ? [{ key: h.isin, idType: 'ID_ISIN' }] : [];
  });
}

/** Ticker of a holding: its own ticker identifier, else the mapped CUSIP, else the mapped ISIN. */
export function tickerLookup(mapped: Record<string, string | null>) {
  return (h: NportHolding): string | null =>
    ownTicker(h) ?? (h.cusip && mapped[h.cusip]) ?? (h.isin && mapped[h.isin]) ?? null;
}

/** Constituents at 4dp half-even with zero results dropped, sorted by weight desc then ticker, plus their sum. */
export function ranked(rows: { ticker: string; name: string; pct: Decimal.Value }[]): { constituents: Constituent[]; sumPct: string } {
  const rounded = rows.map((r) => ({ ...r, pct: new Decimal(r.pct).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN) }))
    .filter((r) => r.pct.gt(0))
    .sort((a, b) => b.pct.cmp(a.pct) || a.ticker.localeCompare(b.ticker));
  return {
    constituents: rounded.map((r) => ({ ticker: r.ticker, name: r.name, weightPct: r.pct.toNumber() })),
    sumPct: Decimal.sum(0, ...rounded.map((r) => r.pct)).toFixed(4),
  };
}

/** Mapped equity rows as constituents (4dp half-even, nothing estimated) plus the written and unmapped sums. */
export function toConstituents(
  holdings: NportHolding[],
  tickerOf: (h: NportHolding) => string | null,
  names: Record<string, string>,
): { constituents: Constituent[]; sumPct: string; unmappedPct: string } {
  const byTicker = new Map<string, { name: string; pct: Decimal }>();
  let unmapped = new Decimal(0);
  for (const h of holdings.filter(isEquity)) {
    const ticker = tickerOf(h);
    if (!ticker) { unmapped = unmapped.plus(h.pctVal); continue; }
    const row = byTicker.get(ticker) ?? { name: names[ticker] ?? h.name, pct: new Decimal(0) };
    byTicker.set(ticker, { ...row, pct: row.pct.plus(h.pctVal) });
  }
  const rows = [...byTicker].map(([ticker, r]) => ({ ticker, name: r.name, pct: r.pct }));
  return { ...ranked(rows), unmappedPct: unmapped.toFixed(4) };
}

/** True when the kept full-list snapshot is newer than the new list (Yahoo stubs and unsourced entries never block). */
export function keptSnapshotBlocks(kept: { holdingsSource?: string; holdingsAsOf?: string }, newAsOf: string): boolean {
  if (!kept.holdingsSource || !kept.holdingsAsOf) return false;
  if (new URL(kept.holdingsSource).hostname.includes('yahoo.com')) return false;
  return newAsOf.slice(0, 10) < kept.holdingsAsOf.slice(0, 10);
}
