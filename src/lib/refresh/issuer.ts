import Decimal from 'decimal.js';
import { parseFundHoldingsCsv } from '../fund-csv';
import { ranked, type Constituent } from './constituents';

/** Constituents of a dated issuer holdings CSV for curated data (DEC-21), or why it is skipped. */
export function issuerConstituents(
  text: string,
  names: Record<string, string>,
): { constituents: Constituent[]; asOf: string; sumPct: string } | { skip: string } {
  const parsed = parseFundHoldingsCsv(text);
  if ('error' in parsed) return { skip: parsed.error };
  if (!parsed.asOf) return { skip: 'issuer file has no holdings date' };
  const rows = parsed.constituents.map((c) => ({ ticker: c.ticker, name: names[c.ticker] ?? c.name, pct: c.weightPct }));
  const { constituents, sumPct } = ranked(rows);
  if (new Decimal(sumPct).gt(100)) return { skip: `weights sum to ${new Decimal(sumPct).toFixed(2)}%, above 100%` };
  return { constituents, asOf: parsed.asOf, sumPct };
}
