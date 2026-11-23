import Decimal from 'decimal.js';
import type { FundValuation, ValuationResult, PrismViewInput } from './types';
import { equityShare, weights } from './weights';

type Point = { e: Decimal; x: Decimal };
type Metric = keyof FundValuation;

/** Weighted harmonic mean over x > 0, null when nothing contributes (D-11). */
function harmonic(points: Point[]): Decimal | null {
  const ps = points.filter((p) => p.x.gt(0));
  if (ps.length === 0) return null;
  return Decimal.sum(0, ...ps.map((p) => p.e)).div(Decimal.sum(0, ...ps.map((p) => p.e.div(p.x))));
}

/** Weighted geometric mean over x > 0, null when nothing contributes (D-11). */
function geometric(points: Point[]): Decimal | null {
  const ps = points.filter((p) => p.x.gt(0));
  if (ps.length === 0) return null;
  const logSum = Decimal.sum(0, ...ps.map((p) => p.e.times(p.x.ln())));
  return logSum.div(Decimal.sum(0, ...ps.map((p) => p.e))).exp();
}

/** Equity-weighted valuation metrics; null without equity (D-11). */
export function valuation(input: PrismViewInput): ValuationResult | null {
  const holders = weights(input)
    .items.map(({ holding, w }) => ({
      e: w.times(equityShare(holding, input)),
      facts: holding.kind === 'FUND' ? input.funds[holding.ticker]?.valuation : input.stocks[holding.ticker],
    }))
    .filter((h) => h.e.gt(0));
  if (holders.length === 0) return null;
  const points = (metric: Metric) =>
    holders.flatMap(({ e, facts }) => (facts?.[metric] == null ? [] : [{ e, x: new Decimal(facts[metric]) }]));
  return {
    marketCapMil: geometric(points('marketCapMil')),
    pe: harmonic(points('pe')),
    pb: harmonic(points('pb')),
    ps: harmonic(points('ps')),
    pcf: harmonic(points('pcf')),
  };
}
