import Decimal from 'decimal.js';
import { parseHoldingsCsv, type CsvRow, type CsvSkip } from '@/lib/csv';
import { prisma } from '@/lib/db';
import { rejectCrossSite } from '@/lib/guard';
import { isCashLike } from '@/lib/engine/ticker';
import { holdingCreateSchema, PORTFOLIO_ID, type HoldingWrite } from '@/lib/holdings';
import { getQuotes } from '@/lib/market';
import type { QuoteResult } from '@/lib/market/types';
import { tickerError } from '@/lib/market/verify';

const MAX_CHARS = 1_000_000;

/**
 * Fold a row's pendingShares into its dollars at the quoted price, 2dp half-even; the tickerError reason when unpriced.
 * Only non-cash rows carry pendingShares, so their quote was fetched.
 */
function priceRow(row: CsvRow, quote: QuoteResult | undefined): CsvRow | string {
  if (row.pendingShares === undefined) return row;
  const result = quote!;
  if (result.status !== 'ok') return tickerError(row.ticker, result)!;
  const { pendingShares, ...rest } = row;
  const value = new Decimal(pendingShares).times(result.quote.price).plus(row.dollarAmount ?? 0);
  return { ...rest, dollarAmount: value.toFixed(2, Decimal.ROUND_HALF_EVEN) };
}

/** Merge a CSV into the portfolio: upsert per ticker, never delete (D-21). */
export async function POST(request: Request) {
  const rejected = rejectCrossSite(request, 'text/csv');
  if (rejected) return rejected;
  const text = await request.text();
  if (text.length > MAX_CHARS) return Response.json({ error: 'File too large (max 1 MB)' }, { status: 413 });
  const parsed = parseHoldingsCsv(text);
  if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  const skipped: CsvSkip[] = [...parsed.skipped];
  const quotes = await getQuotes(parsed.rows.map((r) => r.ticker).filter((t) => !isCashLike(t)));
  const valid: { line: number; write: HoldingWrite }[] = [];
  for (const parsedRow of parsed.rows) {
    const row = priceRow(parsedRow, quotes.get(parsedRow.ticker));
    if (typeof row === 'string') {
      skipped.push({ line: parsedRow.line, reason: row });
      continue;
    }
    const result = holdingCreateSchema.safeParse(row);
    if (result.success) valid.push({ line: row.line, write: result.data });
    else skipped.push({ line: row.line, reason: result.error.issues[0].message });
  }

  const writes: HoldingWrite[] = [];
  for (const { line, write } of valid) {
    const quote = quotes.get(write.ticker);
    const reason = quote ? tickerError(write.ticker, quote) : null;
    if (reason) skipped.push({ line, reason });
    else writes.push(write);
  }
  skipped.sort((a, b) => a.line - b.line);

  const existing = await prisma.portfolioHolding.findMany({
    where: { portfolioId: PORTFOLIO_ID, ticker: { in: writes.map((w) => w.ticker) } },
    select: { ticker: true },
  });
  await prisma.$transaction(
    writes.map(({ ticker, ...amount }) =>
      prisma.portfolioHolding.upsert({
        where: { portfolioId_ticker: { portfolioId: PORTFOLIO_ID, ticker } },
        create: { portfolioId: PORTFOLIO_ID, ticker, ...amount },
        update: amount,
      }),
    ),
  );
  const updated = existing.length;
  return Response.json({ imported: writes.length - updated, updated, skipped });
}
