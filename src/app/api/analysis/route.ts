import { connection } from 'next/server';
import { z } from 'zod';
import { loadAnalysis } from '@/lib/load-analysis';

const querySchema = z.object({ mergeShareClasses: z.enum(['0', '1']).default('0') });

/** Priced holdings, the portfolio summary, the Top 50 intersection and the X-Ray (D-14, D-16). */
export async function GET(request: Request) {
  await connection();
  const { searchParams } = new URL(request.url);
  const query = querySchema.safeParse({ mergeShareClasses: searchParams.get('mergeShareClasses') ?? undefined });
  if (!query.success) return Response.json({ error: query.error.issues[0].message }, { status: 400 });
  return Response.json(await loadAnalysis(query.data.mergeShareClasses === '1'));
}
