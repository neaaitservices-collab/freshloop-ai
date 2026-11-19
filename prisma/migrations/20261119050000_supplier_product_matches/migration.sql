-- Clerk-confirmed supplier code and printed-name links.
-- One table. match_type is varchar plus CHECK, not a Postgres enum.
-- No store_id: this install is a single store. Add store_id before a second store goes live.
--
-- Follows 20261118040000_db_lockdown: Prisma owns the table, anon and authenticated
-- receive no grants, and row level security is enabled with no Data API policy.
-- Those roles are absent on plain Postgres (GitHub Actions role `ci`). Missing roles are skipped.
--
-- The foreign keys lock products and suppliers. Same lock cap as
-- 20261118040000_db_lockdown. The whole migration is one transaction so a
-- failed statement cannot leave a half-built table. Prisma must not open a
-- second transaction around this file.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE "supplier_product_matches" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "match_type" VARCHAR(8) NOT NULL,
    "match_key" VARCHAR(160) NOT NULL,
    "printed_value" VARCHAR(160) NOT NULL,
    "product_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_product_matches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_product_matches_supplier_id_match_type_match_key_key" ON "supplier_product_matches"("supplier_id", "match_type", "match_key");

CREATE INDEX "supplier_product_matches_product_id_idx" ON "supplier_product_matches"("product_id");

ALTER TABLE "supplier_product_matches" ADD CONSTRAINT "supplier_product_matches_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_product_matches" ADD CONSTRAINT "supplier_product_matches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_product_matches" ADD CONSTRAINT "supplier_product_matches_match_type_check" CHECK ("match_type" IN ('code', 'name'));

ALTER TABLE "supplier_product_matches" ADD CONSTRAINT "supplier_product_matches_match_key_check" CHECK ("match_key" <> '');

ALTER TABLE "supplier_product_matches" ADD CONSTRAINT "supplier_product_matches_printed_value_check" CHECK (btrim("printed_value") <> '');

ALTER TABLE "supplier_product_matches" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.supplier_product_matches FROM %I', api_role);
  END LOOP;
END
$$;

COMMIT;
