import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const SAMPLE = [
  { ticker: "VTI", inputMode: "DOLLARS", shares: null, dollarAmount: "40000" },
  { ticker: "FXAIX", inputMode: "DOLLARS", shares: null, dollarAmount: "30000" },
  { ticker: "QQQ", inputMode: "SHARES", shares: "50", dollarAmount: null },
  { ticker: "SCHD", inputMode: "DOLLARS", shares: null, dollarAmount: "10000" },
  { ticker: "BND", inputMode: "DOLLARS", shares: null, dollarAmount: "15000" },
  { ticker: "AAPL", inputMode: "SHARES", shares: "25", dollarAmount: null },
  { ticker: "MSFT", inputMode: "SHARES", shares: "15", dollarAmount: null },
] as const;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Ensure the default portfolio exists; insert the sample only into an empty holdings table. */
async function main() {
  await prisma.portfolio.upsert({
    where: { id: 1 },
    create: { id: 1, name: "My Portfolio", benchmarkTicker: "SPY" },
    update: {},
  });
  if ((await prisma.portfolioHolding.count()) > 0) {
    console.log("Seed: holdings present, skipped sample");
    return;
  }
  await prisma.portfolioHolding.createMany({
    data: SAMPLE.map((h) => ({ ...h, portfolioId: 1 })),
  });
  console.log("Seed: inserted sample holdings");
}

main().finally(() => prisma.$disconnect());
