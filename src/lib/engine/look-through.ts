import Decimal from 'decimal.js';
import type { Exposure, FundData, ResolvedHolding } from './types';

const HUNDRED = new Decimal(100);

function direct(h: ResolvedHolding): Exposure {
  return {
    stock: h.ticker,
    stockName: h.name,
    sourceTicker: h.ticker,
    sourceName: 'Direct Holding',
    fundWeightPct: HUNDRED,
    exposure: new Decimal(h.valueCents.toString()),
  };
}

/** Constituent exposures plus OTHER:<fund> for uncovered weight (D-16..D-18). */
function throughFund(h: ResolvedHolding, fund: FundData): Exposure[] {
  const value = new Decimal(h.valueCents.toString());
  const exposure = (stock: string, stockName: string, weight: Decimal): Exposure => ({
    stock,
    stockName,
    sourceTicker: h.ticker,
    sourceName: fund.name,
    fundWeightPct: weight,
    exposure: value.times(weight).div(HUNDRED),
  });
  const result = fund.constituents.map((c) => exposure(c.ticker, c.name, new Decimal(c.weightPct)));
  const other = HUNDRED.minus(Decimal.sum(0, ...result.map((e) => e.fundWeightPct)));
  if (other.gt(0)) result.push(exposure(`OTHER:${h.ticker}`, `Other (${fund.name})`, other));
  return result;
}

/** Expand holdings into per-stock exposures; CASH yields none (D-08). */
export function lookThrough(holdings: ResolvedHolding[], funds: Record<string, FundData>): Exposure[] {
  return holdings.flatMap((h) => {
    if (h.kind === 'CASH') return [];
    return h.kind === 'FUND' ? throughFund(h, funds[h.ticker]) : [direct(h)];
  });
}
