-- CreateTable
CREATE TABLE "FundHoldingsImport" (
    "ticker" TEXT NOT NULL,
    "constituents" JSONB NOT NULL,
    "holdingsAsOf" DATE NOT NULL,
    "asOfFromFile" BOOLEAN NOT NULL,

    CONSTRAINT "FundHoldingsImport_pkey" PRIMARY KEY ("ticker")
);
