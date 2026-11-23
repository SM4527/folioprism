import { z } from 'zod';
import sample from '../../../data/stock-facts.sample.json';
import { classifyUniverse, type StockFact, type StyleCellKey } from '../engine/prism-view/classify';
import { fundStyleBox } from '../engine/prism-view/fund-style';
import type { FundAggregates } from '../engine/prism-view/types';
import { overlayOn, readLocal } from '../local-data';
import { curatedAggregates, curatedFund } from './mock';
import { sizeThresholds } from './size-breakpoints';

const value = z.number().transform(String).nullable();
const factsSchema = z.record(z.string(), z.object({ marketCapMil: value, pe: value, pb: value, divYieldPct: value }));

/**
 * The stock facts universe. Without the local overlay (the default stack, :8420) this is always the
 * synthetic sample, even if data/local/stock-facts.json exists. With the overlay on (the personal stack)
 * it is that local file when present, else the sample. The two are never merged: ranks need one universe.
 */
export function stockFacts(): Record<string, StockFact> {
  const local = overlayOn() ? readLocal('stock-facts.json') : {};
  return factsSchema.parse(Object.keys(local).length > 0 ? local : sample);
}

let cells: Map<string, StyleCellKey> | undefined;

/** Style box cell per ticker, classified once per process over the whole facts universe. */
export function stockCells(): Map<string, StyleCellKey> {
  return (cells ??= classifyUniverse(stockFacts(), sizeThresholds()));
}

/** A fund's style box calculated from the constituents it is analysed with, against its equity share; null below 60% coverage. */
export function calculatedStyleBox(
  constituents: { ticker: string; weightPct: string }[],
  equityPct: string | null,
): FundAggregates['styleBox'] {
  return fundStyleBox(constituents, stockCells(), equityPct);
}

/** A curated fund's aggregates with its style box calculated from its curated constituents. */
export function curatedWithStyle(ticker: string): FundAggregates | null {
  const aggregates = curatedAggregates(ticker);
  const fund = curatedFund(ticker);
  return aggregates && fund ? { ...aggregates, styleBox: calculatedStyleBox(fund.constituents, aggregates.equityPct) } : null;
}
