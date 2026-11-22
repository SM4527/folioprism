import Decimal from 'decimal.js';
import { canonicalTicker, isCashLike } from './ticker';
import type { EngineInput, HoldingInput, HoldingKind, ResolvedHolding } from './types';

const rekey = <T>(record: Record<string, T>) =>
  Object.fromEntries(Object.entries(record).map(([k, v]) => [canonicalTicker(k), v]));

/** Round a cents amount half-even to an integer bigint (D-11). */
export function toCents(amount: Decimal): bigint {
  return BigInt(amount.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toFixed(0));
}

/** Apply canonicalTicker to every ticker in the input (D-14). */
export function canonicalizeInput(input: EngineInput): EngineInput {
  const funds = Object.fromEntries(
    Object.entries(rekey(input.funds)).map(([k, f]) => [
      k,
      { ...f, constituents: f.constituents.map((c) => ({ ...c, ticker: canonicalTicker(c.ticker) })) },
    ]),
  );
  return {
    holdings: input.holdings.map((h) => ({ ...h, ticker: canonicalTicker(h.ticker) })),
    quotes: rekey(input.quotes),
    funds,
  };
}

function kindOf(ticker: string, input: EngineInput): HoldingKind {
  if (ticker in input.funds) return 'FUND';
  return isCashLike(ticker) ? 'CASH' : 'STOCK';
}

function centsOf(h: HoldingInput, input: EngineInput): bigint {
  const dollars =
    h.inputMode === 'SHARES'
      ? new Decimal(h.shares!).times(input.quotes[h.ticker].price)
      : new Decimal(h.dollarAmount!);
  return toCents(dollars.times(100));
}

/** Sum the cents of holdings that share a canonical ticker (e.g. BRK-B and BRK.B). */
function valueByTicker(input: EngineInput): Map<string, bigint> {
  const values = new Map<string, bigint>();
  for (const h of input.holdings) values.set(h.ticker, (values.get(h.ticker) ?? 0n) + centsOf(h, input));
  return values;
}

/** Resolve each holding's kind, name and value in cents; total includes CASH (D-08, D-11). */
export function normalize(input: EngineInput): { holdings: ResolvedHolding[]; totalCents: bigint } {
  const holdings = [...valueByTicker(input)].map(([ticker, valueCents]) => ({
    ticker,
    name: input.funds[ticker]?.name ?? input.quotes[ticker]?.name ?? ticker,
    kind: kindOf(ticker, input),
    valueCents,
  }));
  const totalCents = holdings.reduce((sum, h) => sum + h.valueCents, 0n);
  return { holdings, totalCents };
}
