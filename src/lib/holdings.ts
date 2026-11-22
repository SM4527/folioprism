import Decimal from 'decimal.js';
import { z } from 'zod';
import { canonicalTicker, isCashLike, TICKER_RE } from './engine/ticker';
import type { HoldingInput, InputMode } from './engine/types';

/** The single default portfolio (D-01). */
export const PORTFOLIO_ID = 1;

/** A holding as sent over the wire: decimals are strings, null fields are omitted (D-07). */
export interface HoldingRow extends HoldingInput {
  id: number;
}

/** Structural stand-in for Prisma's Decimal, so this module stays free of the Prisma client import. */
export interface DecimalLike {
  toString(): string;
  toFixed(dp: number): string;
}

export interface StoredHolding {
  id: number;
  ticker: string;
  inputMode: InputMode;
  shares: DecimalLike | null;
  dollarAmount: DecimalLike | null;
}

/** Map a stored holding to its wire row: shares as plain decimal, dollars at 2dp (D-07). */
export function toHoldingRow(h: StoredHolding): HoldingRow {
  const row: HoldingRow = { id: h.id, ticker: h.ticker, inputMode: h.inputMode };
  if (h.shares) row.shares = h.shares.toString();
  if (h.dollarAmount) row.dollarAmount = h.dollarAmount.toFixed(2);
  return row;
}

export const TICKER_MESSAGE = 'Use 1-12 letters, digits or dots';
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

/** The UI-SPEC message for an invalid amount, or null when it is valid (D-08). */
export function validateAmount(mode: InputMode, value: string): string | null {
  if (!NUMBER_RE.test(value)) return 'Enter an amount';
  const amount = new Decimal(value);
  if (amount.lte(0)) return 'Must be more than 0';
  const maxDp = mode === 'SHARES' ? 6 : 2;
  if (amount.decimalPlaces() > maxDp) return `Max ${maxDp} decimals`;
  if (amount.gte(new Decimal(10).pow(20 - maxDp))) return 'Amount too large';
  return null;
}

/** The normalized amount fields written to the DB: only the field for the mode is set. */
export interface AmountWrite {
  inputMode: InputMode;
  shares: string | null;
  dollarAmount: string | null;
}

/** A normalized holding ready to insert or upsert. */
export interface HoldingWrite extends AmountWrite {
  ticker: string;
}

const amountBody = z.object({
  inputMode: z.enum(['SHARES', 'DOLLARS']),
  shares: z.string().optional(),
  dollarAmount: z.string().optional(),
});
type AmountBody = z.infer<typeof amountBody>;

/**
 * Force cash-like tickers to DOLLARS (D-09; 1 share = $1.00 NAV) and apply amount rules (D-08).
 * Null when invalid after reporting the issue.
 */
function toAmountWrite(ticker: string, body: AmountBody, addIssue: (m: string) => void): AmountWrite | null {
  const cash = isCashLike(ticker);
  const inputMode: InputMode = cash ? 'DOLLARS' : body.inputMode;
  const value =
    (cash ? (body.dollarAmount ?? body.shares) : inputMode === 'SHARES' ? body.shares : body.dollarAmount) ?? '';
  const message = validateAmount(inputMode, value);
  if (message) {
    addIssue(message);
    return null;
  }
  return inputMode === 'SHARES'
    ? { inputMode, shares: value, dollarAmount: null }
    : { inputMode, shares: null, dollarAmount: value };
}

/** POST body: canonical ticker plus mode and its amount. */
export const holdingCreateSchema = amountBody
  .extend({ ticker: z.string() })
  .transform((body, ctx): HoldingWrite => {
    const ticker = canonicalTicker(body.ticker);
    if (!TICKER_RE.test(ticker)) {
      ctx.addIssue(TICKER_MESSAGE);
      return z.NEVER;
    }
    const amount = toAmountWrite(ticker, body, (m) => ctx.addIssue(m));
    return amount ? { ticker, ...amount } : z.NEVER;
  });

/**
 * PATCH body for an existing ticker. It always carries the mode plus its amount,
 * because a mode change must clear the other field (D-14).
 */
export function holdingPatchSchema(ticker: string) {
  return amountBody.transform(
    (body, ctx): AmountWrite => toAmountWrite(ticker, body, (m) => ctx.addIssue(m)) ?? z.NEVER,
  );
}
