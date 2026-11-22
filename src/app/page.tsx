import { Suspense } from 'react';
import { connection } from 'next/server';
import { prisma } from '@/lib/db';
import { PORTFOLIO_ID, toHoldingRow } from '@/lib/holdings';
import { PortfolioApp } from '@/components/portfolio-app';
import { chatEnabled } from '@/lib/chat/llm';

/** Loads the default portfolio at request time; there is no DB at build time (D-11). */
async function PortfolioLoader() {
  await connection();
  const [portfolio, holdings] = await Promise.all([
    prisma.portfolio.findUniqueOrThrow({ where: { id: PORTFOLIO_ID } }),
    prisma.portfolioHolding.findMany({
      where: { portfolioId: PORTFOLIO_ID },
      orderBy: { id: 'asc' },
    }),
  ]);
  return (
    <PortfolioApp
      portfolio={{ name: portfolio.name, benchmarkTicker: portfolio.benchmarkTicker }}
      initialHoldings={holdings.map(toHoldingRow)}
      chatEnabled={chatEnabled()}
    />
  );
}

export default function Home() {
  return (
    <Suspense>
      <PortfolioLoader />
    </Suspense>
  );
}
