-- DepartmentRef expand step. The Department enum and the department columns stay.
--
-- NELSON-APPROVED DEPLOY ONLY.
-- This migration was not run against a shared, preview, or production database.
-- Order:
--   1. Back up the database.
--   2. Run `npx prisma migrate deploy` on a throwaway test database first.
--   3. Check department_refs (one row per Department enum code) and that
--      products, invoice_line_items, and inventory_items have department_id filled
--      where the enum code matches a row.
--   4. After approval, run `npx prisma migrate deploy` on production.
--      This file creates the table, seeds it, adds nullable foreign keys, and backfills.
--   5. Optional later repeat: scripts/backfill-department-refs.sql
--      (ON CONFLICT DO NOTHING; updates only where department_id IS NULL).
-- Rollback: drop the three department_id foreign keys, indexes, and columns, then
-- drop department_refs. The enum columns are unchanged, so reads fall back to them.
--
-- Seed and backfill statements are verbatim copies of departmentRefSeedSql() and
-- departmentBackfillSql() in lib/domains/catalog/departmentRef.ts.

CREATE TABLE IF NOT EXISTS "department_refs" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "department_refs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "department_refs_code_key" ON "department_refs"("code");
CREATE INDEX IF NOT EXISTS "department_refs_active_sort_order_idx" ON "department_refs"("active", "sort_order");

INSERT INTO "department_refs" ("id", "code", "name", "active", "sort_order")
VALUES
  ('d1000000-0000-4000-8000-000000000001', 'PRODUCE', 'Produce', true, 10),
  ('d1000000-0000-4000-8000-000000000002', 'DAIRY', 'Dairy', true, 20),
  ('d1000000-0000-4000-8000-000000000003', 'BAKERY', 'Bakery', true, 30),
  ('d1000000-0000-4000-8000-000000000004', 'PANTRY', 'Pantry', true, 40),
  ('d1000000-0000-4000-8000-000000000005', 'DELI_KITCHEN', 'Deli / Production', true, 50),
  ('d1000000-0000-4000-8000-000000000006', 'GROCERY', 'Grocery', true, 60)
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "department_id" TEXT;
ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "department_id" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "department_id" TEXT;

UPDATE "products" AS item
SET "department_id" = ref."id"
FROM "department_refs" AS ref
WHERE item."department_id" IS NULL
  AND ref."code" = item."department"::text;

UPDATE "invoice_line_items" AS item
SET "department_id" = ref."id"
FROM "department_refs" AS ref
WHERE item."department_id" IS NULL
  AND ref."code" = item."department"::text;

UPDATE "inventory_items" AS item
SET "department_id" = ref."id"
FROM "department_refs" AS ref
WHERE item."department_id" IS NULL
  AND ref."code" = item."department"::text;

DO $$ BEGIN
  ALTER TABLE "products"
    ADD CONSTRAINT "products_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "department_refs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoice_line_items"
    ADD CONSTRAINT "invoice_line_items_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "department_refs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_items"
    ADD CONSTRAINT "inventory_items_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "department_refs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "products_department_id_idx" ON "products"("department_id");
CREATE INDEX IF NOT EXISTS "invoice_line_items_department_id_idx" ON "invoice_line_items"("department_id");
CREATE INDEX IF NOT EXISTS "inventory_items_department_id_idx" ON "inventory_items"("department_id");
