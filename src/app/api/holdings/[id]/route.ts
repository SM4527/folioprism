import { z } from 'zod';
import { prisma } from '@/lib/db';
import { rejectCrossSite } from '@/lib/guard';
import { holdingPatchSchema, PORTFOLIO_ID, toHoldingRow } from '@/lib/holdings';

type Ctx = RouteContext<'/api/holdings/[id]'>;

const idSchema = z.coerce.number().int().positive();
const error = (message: string, status: number) => Response.json({ error: message }, { status });

/** Change a holding's mode and amount; the other amount field is cleared (D-14). */
export async function PATCH(request: Request, ctx: Ctx) {
  const rejected = rejectCrossSite(request, 'application/json');
  if (rejected) return rejected;
  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success) return error('Invalid id', 400);
  const holding = await prisma.portfolioHolding.findFirst({ where: { id: id.data, portfolioId: PORTFOLIO_ID } });
  if (!holding) return error('Holding not found', 404);
  const parsed = holdingPatchSchema(holding.ticker).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const row = await prisma.portfolioHolding.update({ where: { id: holding.id }, data: parsed.data });
  return Response.json(toHoldingRow(row));
}

/** Delete a holding by id (D-15); its fund import goes with it in one transaction (WR-07). */
export async function DELETE(request: Request, ctx: Ctx) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success) return error('Invalid id', 400);
  const deleted = await prisma.$transaction(async (tx) => {
    const holding = await tx.portfolioHolding.findFirst({ where: { id: id.data, portfolioId: PORTFOLIO_ID } });
    if (!holding) return false;
    const { count } = await tx.portfolioHolding.deleteMany({ where: { id: holding.id } });
    if (!count) return false;
    await tx.fundHoldingsImport.deleteMany({ where: { ticker: holding.ticker } });
    return true;
  });
  return deleted ? new Response(null, { status: 204 }) : error('Holding not found', 404);
}
