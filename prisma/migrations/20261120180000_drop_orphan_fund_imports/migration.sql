-- Remove fund imports whose holding was deleted before imports were deleted with it (WR-07).
DELETE FROM "FundHoldingsImport" i
WHERE NOT EXISTS (SELECT 1 FROM "PortfolioHolding" h WHERE h."ticker" = i."ticker");
