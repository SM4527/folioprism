import { connection } from 'next/server';
import { prisma } from '@/lib/db';
import { rejectCrossSite } from '@/lib/guard';
import { isCashLike } from '@/lib/engine/ticker';
import { holdingCreateSchema, PORTFOLIO_ID, toHoldingRow } from '@/lib/holdings';
import { getQuote } from '@/lib/market';
import { tickerError } from '@/lib/market/verify';

/** All holdings in insertion order, decimals as strings (D-06, D-07). */
export async function GET() {
  await connection();
  const holdings = await prisma.portfolioHolding.findMany({
    where: { portfolioId: PORTFOLIO_ID },
    orderBy: { id: 'asc' },
  });
  return Response.json(holdings.map(toHoldingRow));
}

/** Add a holding, or replace the amount of an existing ticker (D-10); unknown tickers are refused (D-12). */
export async function POST(request: Request) {
  const rejected = rejectCrossSite(request, 'application/json');
  if (rejected) return rejected;
  const parsed = holdingCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { ticker, ...amount } = parsed.data;
  const error = isCashLike(ticker) ? null : tickerError(ticker, await getQuote(ticker));
  if (error) return Response.json({ error }, { status: 400 });
  const key = { portfolioId_ticker: { portfolioId: PORTFOLIO_ID, ticker } };
  const existing = await prisma.portfolioHolding.findUnique({ where: key });
  const row = await prisma.portfolioHolding.upsert({
    where: key,
    create: { portfolioId: PORTFOLIO_ID, ticker, ...amount },
    update: amount,
  });
  return Response.json({ holding: toHoldingRow(row), created: !existing }, { status: existing ? 200 : 201 });
}
