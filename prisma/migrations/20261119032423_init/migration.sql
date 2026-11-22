-- CreateEnum
CREATE TYPE "InputMode" AS ENUM ('SHARES', 'DOLLARS');

-- CreateEnum
CREATE TYPE "DataType" AS ENUM ('QUOTE', 'HOLDINGS', 'METADATA');

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT 'My Portfolio',
    "benchmarkTicker" TEXT NOT NULL DEFAULT 'SPY',

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioHolding" (
    "id" SERIAL NOT NULL,
    "portfolioId" INTEGER NOT NULL DEFAULT 1,
    "ticker" TEXT NOT NULL,
    "inputMode" "InputMode" NOT NULL,
    "shares" DECIMAL(20,6),
    "dollarAmount" DECIMAL(20,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioHolding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketDataCache" (
    "ticker" TEXT NOT NULL,
    "dataType" "DataType" NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketDataCache_pkey" PRIMARY KEY ("ticker","dataType")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioHolding_portfolioId_ticker_key" ON "PortfolioHolding"("portfolioId", "ticker");

-- AddForeignKey
ALTER TABLE "PortfolioHolding" ADD CONSTRAINT "PortfolioHolding_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
