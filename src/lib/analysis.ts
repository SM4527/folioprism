import Decimal from 'decimal.js';
import { computeIntersection } from './engine/intersection';
import { canonicalizeInput, normalize } from './engine/normalize';
import { serialize } from './engine/serialize';
import { canonicalTicker, isCashLike } from './engine/ticker';
import { computePrismView, serializePrismView } from './engine/prism-view';
import type { FundAggregates, SerializedPrismView, PrismViewInput } from './engine/prism-view/types';
import type {
  EngineInput,
  FundSource,
  IntersectionResult,
  Quote,
  ResolvedHolding,
  SerializedRow,
} from './engine/types';
import type { HoldingRow } from './holdings';
import {
  LIVE_PROVENANCE,
  type AsOfOrigin,
  type FundHoldings,
  type MarketQuote,
  type QuoteResult,
  type QuoteSource,
  type StockMetadata,
} from './market/types';

/** Fund holdings, direct stock metadata and the benchmark's curated aggregates, keyed by held ticker. */
export interface MarketData {
  funds: Record<string, FundHoldings>;
  metadata: Record<string, StockMetadata | null>;
  benchmark: FundAggregates | null;
}

/** One priced holding on the wire; cents are integer strings (D-14). */
export interface AnalysisHolding {
  id: number;
  ticker: string;
  name: string;
  livePrice: string | null;
  priceKind: 'PRICE' | 'NAV';
  asOf: string | null;
  source: QuoteSource | null;
  stale: boolean;
  valueCents: string | null;
}

/** One coverage line: a fund (curated or Yahoo top 10) or a direct stock at 100% (D-25). */
export interface CoverageItem {
  ticker: string;
  coveredPct: string;
  source: FundSource | 'direct';
  unavailable: boolean;
  sourceUrl: string | null;
  /** Holdings as-of date, YYYY-MM-DD. */
  holdingsAsOf: string | null;
  asOfOrigin: AsOfOrigin | null;
  curated: boolean;
}

/** Global and per-holding look-through coverage; fund percents are null when no fund is held. */
export interface AnalysisCoverage {
  lookThroughPct: string;
  otherPct: string;
  fundCoveredPct: string | null;
  fundOtherPct: string | null;
  items: CoverageItem[];
}

/** The GET /api/analysis payload (D-14). */
export interface Analysis {
  summary: {
    name: string;
    benchmark: string;
    totalCents: string;
    asOf: string | null;
    staleTickers: string[];
    /** SHARES holdings with no price, left out of totalCents and every percent. */
    unpricedTickers: string[];
  };
  holdings: AnalysisHolding[];
  intersection: { rows: SerializedRow[]; coverage: AnalysisCoverage };
  /** Prism View allocation, style box, valuation and fees, portfolio vs benchmark (D-14, D-16). */
  prismView: SerializedPrismView;
}

/** The fixed price of CASH and the $1.00 NAV of money-market funds (D-09). */
export const CASH_PRICE = '1.00';

const rekey = <T>(record: Record<string, T>) =>
  Object.fromEntries(Object.entries(record).map(([k, v]) => [canonicalTicker(k), v]));

/** PrismView input from the priced holdings, fund aggregates and stock metadata, keyed by canonical ticker. */
function prismViewInput(resolved: ResolvedHolding[], market: MarketData): PrismViewInput {
  return {
    holdings: resolved.map((r) => ({ ticker: r.ticker, kind: r.kind, valueCents: r.valueCents.toString() })),
    funds: rekey(Object.fromEntries(Object.entries(market.funds).map(([t, f]) => [t, f.aggregates ?? null]))),
    stocks: rekey(market.metadata),
  };
}

/** The benchmark as one fund holding worth the portfolio total (D-14). */
function benchmarkInput(ticker: string, aggregates: FundAggregates, totalCents: bigint): PrismViewInput {
  return { holdings: [{ ticker, kind: 'FUND', valueCents: totalCents.toString() }], funds: { [ticker]: aggregates }, stocks: {} };
}

/** The ok quotes, keyed by ticker. */
function okQuotes(quotes: Map<string, QuoteResult>): Map<string, MarketQuote> {
  const ok = new Map<string, MarketQuote>();
  for (const [t, r] of quotes) if (r.status === 'ok') ok.set(t, r.quote);
  return ok;
}

/** Holdings the engine can value: cash, dollar amounts, and shares with a price. */
function engineInput(
  holdings: HoldingRow[],
  ok: Map<string, MarketQuote>,
  funds: Record<string, FundHoldings>,
): EngineInput {
  const priced = holdings.filter((h) => isCashLike(h.ticker) || h.inputMode === 'DOLLARS' || ok.has(h.ticker));
  const quotes: Record<string, Quote> = Object.fromEntries(ok);
  for (const h of holdings) if (isCashLike(h.ticker)) quotes[h.ticker] = { price: CASH_PRICE, name: h.ticker };
  return { holdings: priced, quotes, funds };
}

/** Latest provider market time across the ok quotes. */
function latestAsOf(ok: Map<string, MarketQuote>): string | null {
  const times = [...ok.values()].map((q) => q.asOf).sort();
  return times.at(-1) ?? null;
}

/** Fund-value-weighted average of the engine per-fund coverage, 4dp half-even (D-25). */
function fundCoverage(result: IntersectionResult, resolved: ResolvedHolding[]): string | null {
  const values = new Map(resolved.map((r) => [r.ticker, new Decimal(r.valueCents.toString())]));
  const perFund = result.coverage.perFund;
  if (perFund.length === 0) return null;
  const total = Decimal.sum(...perFund.map((f) => values.get(f.ticker)!));
  if (total.isZero()) return null;
  const covered = Decimal.sum(...perFund.map((f) => values.get(f.ticker)!.times(f.coveredPct)));
  return covered.div(total).toFixed(4, Decimal.ROUND_HALF_EVEN);
}

/** Engine coverage plus direct stocks at 100%, built here so the engine stays unchanged (D-16). */
function coverageOf(
  result: IntersectionResult,
  resolved: ResolvedHolding[],
  funds: Record<string, FundHoldings>,
): AnalysisCoverage {
  const fundItems: CoverageItem[] = result.coverage.perFund.map((f) => {
    const p = funds[f.ticker]?.provenance ?? LIVE_PROVENANCE;
    return {
      ticker: f.ticker,
      coveredPct: f.coveredPct.toFixed(4),
      source: f.source,
      unavailable: funds[f.ticker]?.unavailable ?? false,
      sourceUrl: p.url,
      holdingsAsOf: p.asOf,
      asOfOrigin: p.asOfOrigin,
      curated: p.curated,
    };
  });
  const directItems: CoverageItem[] = resolved
    .filter((r) => r.kind === 'STOCK')
    .map((r) => r.ticker)
    .sort()
    .map((ticker) => ({
      ticker,
      coveredPct: '100.0000',
      source: 'direct',
      unavailable: false,
      sourceUrl: null,
      holdingsAsOf: null,
      asOfOrigin: null,
      curated: false,
    }));
  const fundCoveredPct = fundCoverage(result, resolved);
  return {
    lookThroughPct: result.coverage.lookThroughPct.toFixed(4),
    otherPct: result.coverage.otherPct.toFixed(4),
    fundCoveredPct,
    fundOtherPct: fundCoveredPct === null ? null : new Decimal(100).minus(fundCoveredPct).toFixed(4),
    items: [...fundItems, ...directItems],
  };
}

/** A cash-like holding row: a fixed $1.00 price, NAV for money markets (D-09). */
function cashRow(h: HoldingRow, value: ResolvedHolding | undefined): AnalysisHolding {
  return {
    id: h.id,
    ticker: h.ticker,
    name: value?.name ?? h.ticker,
    livePrice: CASH_PRICE,
    priceKind: h.ticker === 'CASH' ? 'PRICE' : 'NAV',
    asOf: null,
    source: null,
    stale: false,
    valueCents: value ? value.valueCents.toString() : null,
  };
}

/** Price every holding, total the portfolio, run the look-through intersection and the Prism View against the benchmark (D-14, D-16). */
export function buildAnalysis(
  portfolio: { name: string; benchmarkTicker: string },
  holdings: HoldingRow[],
  quotes: Map<string, QuoteResult>,
  market: MarketData,
  mergeShareClasses: boolean,
): Analysis {
  const { funds, benchmark } = market;
  const ok = okQuotes(quotes);
  const input = engineInput(holdings, ok, funds);
  const { holdings: resolved, totalCents } = normalize(canonicalizeInput(input));
  const result = computeIntersection(input, { mergeShareClasses });
  const values = new Map(resolved.map((r) => [r.ticker, r]));
  const rows: AnalysisHolding[] = holdings.map((h) => {
    const value = values.get(h.ticker);
    if (isCashLike(h.ticker)) return cashRow(h, value);
    const quote = ok.get(h.ticker);
    return {
      id: h.id,
      ticker: h.ticker,
      name: quote?.name ?? value?.name ?? h.ticker,
      livePrice: quote?.price ?? null,
      priceKind: quote?.quoteType === 'MUTUALFUND' ? 'NAV' : 'PRICE',
      asOf: quote?.asOf ?? null,
      source: quote?.source ?? null,
      stale: quote?.stale ?? false,
      valueCents: value ? value.valueCents.toString() : null,
    };
  });
  return {
    summary: {
      name: portfolio.name,
      benchmark: portfolio.benchmarkTicker,
      totalCents: totalCents.toString(),
      asOf: latestAsOf(ok),
      staleTickers: rows.filter((r) => r.stale).map((r) => r.ticker),
      unpricedTickers: rows.filter((r) => r.valueCents === null).map((r) => r.ticker),
    },
    holdings: rows,
    intersection: {
      rows: serialize(result).rows,
      coverage: coverageOf(result, resolved, funds),
    },
    prismView: serializePrismView(
      computePrismView(prismViewInput(resolved, market)),
      benchmark ? computePrismView(benchmarkInput(portfolio.benchmarkTicker, benchmark, totalCents)) : null,
    ),
  };
}
