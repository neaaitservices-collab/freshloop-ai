-- Alert threshold in cases. Stock itself stays on the ledger.
ALTER TABLE "products" ADD COLUMN "parCases" INTEGER NOT NULL DEFAULT 2;
