-- AlterTable
ALTER TABLE "products" ADD COLUMN "receivePackSize" DOUBLE PRECISION,
ADD COLUMN "yieldDivisor" DOUBLE PRECISION DEFAULT 1;

-- Backfill: legacy rows only stored sellable units per case on casePackSize
UPDATE "products"
SET "receivePackSize" = COALESCE(NULLIF("casePackSize", 0), 1),
    "yieldDivisor" = COALESCE(NULLIF("yieldDivisor", 0), 1)
WHERE "receivePackSize" IS NULL;
