import { connection } from 'next/server';
import { z } from 'zod';
import { BENCHMARK_TICKERS } from '@/lib/benchmarks';
import { prisma } from '@/lib/db';
import { rejectCrossSite } from '@/lib/guard';
import { PORTFOLIO_ID } from '@/lib/holdings';

/** The single default portfolio (D-06). */
export async function GET() {
  await connection();
  const { id, name, benchmarkTicker } = await prisma.portfolio.findUniqueOrThrow({
    where: { id: PORTFOLIO_ID },
  });
  return Response.json({ id, name, benchmarkTicker });
}

const patchSchema = z.object({ benchmarkTicker: z.enum(BENCHMARK_TICKERS) });

/** Change the benchmark (D-17). */
export async function PATCH(request: Request) {
  const rejected = rejectCrossSite(request, 'application/json');
  if (rejected) return rejected;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { id, name, benchmarkTicker } = await prisma.portfolio.update({
    where: { id: PORTFOLIO_ID },
    data: parsed.data,
  });
  return Response.json({ id, name, benchmarkTicker });
}
