import Decimal from 'decimal.js';
import { toCents } from '../normalize';
import type { FeesResult, XrayInput } from './types';

/** Weighted expense ratio, annual fee in cents and funds with unknown ER; stocks and cash are 0% (D-12). */
export function fees(input: XrayInput): FeesResult {
  const totalCents = input.holdings.reduce((sum, h) => sum + BigInt(h.valueCents), 0n);
  const funds = input.holdings.filter((h) => h.kind === 'FUND');
  const unknownTickers = funds.filter((h) => input.funds[h.ticker]?.expenseRatioPct == null).map((h) => h.ticker).sort();
  const weighted = Decimal.sum(
    0,
    ...funds.map((h) => new Decimal(h.valueCents).times(input.funds[h.ticker]?.expenseRatioPct ?? 0)),
  );
  const expenseRatioPct =
    totalCents === 0n
      ? new Decimal(0)
      : weighted.div(totalCents.toString()).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
  return { expenseRatioPct, feeCents: toCents(weighted.div(100)), unknownTickers };
}
