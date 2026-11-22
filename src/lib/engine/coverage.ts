import Decimal from 'decimal.js';
import type { Coverage, EngineInput, Exposure } from './types';

const pctOf = (cents: Decimal, totalCents: bigint) =>
  totalCents === 0n
    ? new Decimal(0)
    : cents.div(totalCents.toString()).times(100).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);

const sumExposure = (es: Exposure[]) => Decimal.sum(0, ...es.map((e) => e.exposure));

/** Share of the portfolio seen through to stocks vs. OTHER, plus per-fund coverage. */
export function computeCoverage(input: EngineInput, exposures: Exposure[], totalCents: bigint): Coverage {
  const isOther = (e: Exposure) => e.stock.startsWith('OTHER:');
  const heldFunds = [...new Set(input.holdings.map((h) => h.ticker))]
    .filter((t) => t in input.funds)
    .sort();
  const perFund = heldFunds.map((ticker) => {
    const fund = input.funds[ticker];
    const covered = Decimal.sum(0, ...fund.constituents.map((c) => c.weightPct));
    return { ticker, coveredPct: Decimal.min(covered, 100), source: fund.source };
  });
  return {
    lookThroughPct: pctOf(sumExposure(exposures.filter((e) => !isOther(e))), totalCents),
    otherPct: pctOf(sumExposure(exposures.filter(isOther)), totalCents),
    perFund,
  };
}
