-- AlterTable
ALTER TABLE "products" ADD COLUMN "case_retail_price" DOUBLE PRECISION;

-- Backfill from unit × sellable per case where possible
UPDATE "products" p
SET "case_retail_price" = ROUND((p."retailPrice" * COALESCE(NULLIF(p."receivePackSize", 0), NULLIF(p."casePackSize", 0), 1) / COALESCE(NULLIF(p."splitFactor", 0), 1))::numeric, 2)
WHERE p."retailPrice" IS NOT NULL
  AND p."retailPrice" > 0
  AND p."case_retail_price" IS NULL;
