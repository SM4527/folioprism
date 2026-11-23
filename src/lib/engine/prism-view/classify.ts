import Decimal from 'decimal.js';
import { STYLE_SIZES, STYLE_STYLES, type StyleSize, type StyleStyle } from '../taxonomy';

/** One stock's facts as decimal strings; null when unknown. */
export interface StockFact {
  marketCapMil: string | null;
  pe: string | null;
  pb: string | null;
  divYieldPct: string | null;
}

export type StyleCellKey = { size: StyleSize; style: StyleStyle };

/**
 * Market-cap thresholds in $mil. 'market': relative to the US market (largest 70% of value Large,
 * next 20% Mid, rest Small). 'fixed': the $10B / $2B fallback when no breakpoints file is available.
 */
export interface SizeThresholds {
  largeMinMil: string;
  midMinMil: string;
  basis: 'market' | 'fixed';
}

export const FIXED_THRESHOLDS: SizeThresholds = { largeMinMil: '10000', midMinMil: '2000', basis: 'fixed' };

/** P/B below this is treated as a data error (seen: BRK-B at 0.001). */
const MIN_PB = new Decimal('0.05');

/** Size band from market cap in $mil against the thresholds. */
export function sizeOf(marketCapMil: Decimal, t: SizeThresholds): StyleSize {
  return marketCapMil.gte(t.largeMinMil) ? 'large' : marketCapMil.gte(t.midMinMil) ? 'mid' : 'small';
}

/** The three value yields; a yield is null when its ratio is missing or unusable. Higher means more value. */
function yields(f: StockFact): (Decimal | null)[] {
  const pe = f.pe === null ? null : new Decimal(f.pe);
  const pb = f.pb === null ? null : new Decimal(f.pb);
  return [
    pe && pe.gt(0) ? new Decimal(1).div(pe) : null,
    pb && pb.gte(MIN_PB) ? new Decimal(1).div(pb) : null,
    f.divYieldPct === null ? null : new Decimal(f.divYieldPct),
  ];
}

/** Percentile ranks 0..1 (ties share their average position); a single value ranks 0.5. */
function ranks(values: Map<string, Decimal>): Map<string, number> {
  const sorted = [...values].sort(([a, x], [b, y]) => x.comparedTo(y) || (a < b ? -1 : 1));
  const out = new Map<string, number>();
  const last = sorted.length - 1;
  for (let i = 0; i <= last; ) {
    let j = i;
    while (j < last && sorted[j + 1][1].eq(sorted[i][1])) j++;
    const rank = last === 0 ? 0.5 : (i + j) / 2 / last;
    for (let k = i; k <= j; k++) out.set(sorted[k][0], rank);
    i = j + 1;
  }
  return out;
}

/** Value/blend/growth by count-based thirds of the mean yield rank, highest score first; a lone stock is blend. */
function styleBand(band: [string, (Decimal | null)[]][]): [string, StyleStyle][] {
  const perMetric = [0, 1, 2].map((m) =>
    ranks(new Map(band.flatMap(([t, ys]) => (ys[m] ? [[t, ys[m]!] as const] : [])))),
  );
  const scores = band.map(([t]) => {
    const got = perMetric.flatMap((r) => (r.has(t) ? [r.get(t)!] : []));
    return [t, got.reduce((s, r) => s + r, 0) / got.length] as const;
  });
  scores.sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1));
  return scores.map(([t], i) => [t, STYLE_STYLES[Math.floor(((i + 0.5) * 3) / scores.length)]]);
}

/**
 * Style box cell for every classifiable stock, ranked within each size band across the whole universe,
 * so a stock lands in the same cell in every fund. Stocks without a market cap or any usable ratio are left out.
 */
export function classifyUniverse(facts: Record<string, StockFact>, t: SizeThresholds): Map<string, StyleCellKey> {
  const bands = new Map<StyleSize, [string, (Decimal | null)[]][]>(STYLE_SIZES.map((s) => [s, []]));
  for (const [ticker, f] of Object.entries(facts)) {
    if (f.marketCapMil === null || new Decimal(f.marketCapMil).lte(0)) continue;
    const ys = yields(f);
    if (ys.every((y) => y === null)) continue;
    bands.get(sizeOf(new Decimal(f.marketCapMil), t))!.push([ticker, ys]);
  }
  const out = new Map<string, StyleCellKey>();
  for (const [size, band] of bands) for (const [t, style] of styleBand(band)) out.set(t, { size, style });
  return out;
}
