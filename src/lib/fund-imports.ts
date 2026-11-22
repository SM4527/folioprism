import { z } from 'zod';
import { prisma } from './db';
import type { Constituent } from './engine/types';
import { PERCENT, type FundHoldings } from './market/types';

/** A user-imported issuer holdings file; holdingsAsOf is `YYYY-MM-DD` (DEC-05, DEC-08). */
export interface FundImport {
  constituents: Constituent[];
  holdingsAsOf: string;
  asOfFromFile: boolean;
}

const constituentsSchema = z.array(z.object({ ticker: z.string(), name: z.string(), weightPct: PERCENT }));

/** Stored imports for the given fund tickers, keyed by ticker. */
export async function readImports(tickers: string[]): Promise<Map<string, FundImport>> {
  const rows = await prisma.fundHoldingsImport.findMany({ where: { ticker: { in: tickers } } });
  return new Map(
    rows.map((r) => [
      r.ticker,
      {
        constituents: constituentsSchema.parse(r.constituents),
        holdingsAsOf: r.holdingsAsOf.toISOString().slice(0, 10),
        asOfFromFile: r.asOfFromFile,
      },
    ]),
  );
}

/**
 * Create or replace a held fund's import; returns false when the fund is not held.
 * The holding row is locked so a concurrent holding delete cannot leave an orphan import (WR-03).
 */
export async function saveHeldImport(portfolioId: number, ticker: string, imp: FundImport): Promise<boolean> {
  const constituents = imp.constituents.map((c) => ({ ticker: c.ticker, name: c.name, weightPct: c.weightPct }));
  const data = { constituents, holdingsAsOf: new Date(imp.holdingsAsOf), asOfFromFile: imp.asOfFromFile };
  return prisma.$transaction(async (tx) => {
    const held = await tx.$queryRaw<unknown[]>`
      SELECT 1 FROM "PortfolioHolding" WHERE "portfolioId" = ${portfolioId} AND "ticker" = ${ticker} FOR UPDATE`;
    if (!held.length) return false;
    await tx.fundHoldingsImport.upsert({ where: { ticker }, create: { ticker, ...data }, update: data });
    return true;
  });
}

/** Remove a fund's import; returns the number of rows removed. */
export async function deleteImport(ticker: string): Promise<number> {
  const { count } = await prisma.fundHoldingsImport.deleteMany({ where: { ticker } });
  return count;
}

/** The fund with imported constituents; name and X-Ray aggregates stay from the base source (DEC-06). */
export function withImport(base: FundHoldings, imp: FundImport): FundHoldings {
  return {
    ...base,
    source: 'imported',
    constituents: imp.constituents,
    unavailable: false,
    provenance: {
      url: null,
      asOf: imp.holdingsAsOf,
      asOfOrigin: imp.asOfFromFile ? 'file' : 'upload',
      curated: base.provenance?.curated ?? false,
    },
  };
}
