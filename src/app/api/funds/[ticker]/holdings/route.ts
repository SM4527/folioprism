import { canonicalTicker, isCashLike, TICKER_RE } from '@/lib/engine/ticker';
import { parseFundHoldingsCsv } from '@/lib/fund-csv';
import { deleteImport, saveHeldImport } from '@/lib/fund-imports';
import { rejectCrossSite } from '@/lib/guard';
import { PORTFOLIO_ID } from '@/lib/holdings';

type Ctx = RouteContext<'/api/funds/[ticker]/holdings'>;

const MAX_CHARS = 2_000_000;
const error = (message: string, status: number) => Response.json({ error: message }, { status });

/** The canonical route ticker, or null when it is not a valid non-cash ticker. */
async function routeTicker(ctx: Ctx): Promise<string | null> {
  const ticker = canonicalTicker((await ctx.params).ticker);
  return TICKER_RE.test(ticker) && !isCashLike(ticker) ? ticker : null;
}

/** Replace a held fund's constituents with an issuer holdings CSV (DEC-05, DEC-10). */
export async function POST(request: Request, ctx: Ctx) {
  const rejected = rejectCrossSite(request, 'text/csv');
  if (rejected) return rejected;
  const ticker = await routeTicker(ctx);
  if (!ticker) return error('invalid ticker', 400);
  const text = await request.text();
  if (text.length > MAX_CHARS) return error('file too large (max 2 MB)', 413);
  const parsed = parseFundHoldingsCsv(text);
  if ('error' in parsed) return error(parsed.error, 400);
  const asOf = parsed.asOf ?? new Date().toISOString().slice(0, 10);
  const asOfFromFile = parsed.asOf !== null;
  const imp = { constituents: parsed.constituents, holdingsAsOf: asOf, asOfFromFile };
  if (!(await saveHeldImport(PORTFOLIO_ID, ticker, imp))) return error('fund is not held', 404);
  const { constituents, skipped, sumPct } = parsed;
  return Response.json({ ticker, count: constituents.length, asOf, asOfFromFile, sumPct, skipped });
}

/** Remove a fund's import so it returns to its curated or Yahoo constituents. */
export async function DELETE(request: Request, ctx: Ctx) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const ticker = await routeTicker(ctx);
  if (!ticker) return error('invalid ticker', 400);
  return (await deleteImport(ticker)) ? new Response(null, { status: 204 }) : error('no imported holdings', 404);
}
