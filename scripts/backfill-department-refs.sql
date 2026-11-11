-- Re-runnable department seed and backfill.
-- DO NOT run this against a shared, preview, or production database without Nelson's approval.
-- Back up first. Run it on a throwaway test database first.
--
-- The migration prisma/migrations/20261111120000_department_ref/migration.sql already
-- creates department_refs, seeds these rows, adds department_id, and runs this backfill.
-- Use this script only to repeat the data step (for example, rows inserted before the
-- table existed, or a deploy that applied an older schema). It is safe to run again:
--   * INSERT ignores codes that already exist (ids stay put).
--   * UPDATE fills department_id only where it is still null.
-- The Department enum columns are not modified.
--
-- Statements below are verbatim copies of departmentRefSeedSql() and
-- departmentBackfillSql() in lib/domains/catalog/departmentRef.ts.
-- One transaction: a failed statement rolls the seed and the three updates back together.

BEGIN;

INSERT INTO "department_refs" ("id", "code", "name", "active", "sort_order")
VALUES
  ('d1000000-0000-4000-8000-000000000001', 'PRODUCE', 'Produce', true, 10),
  ('d1000000-0000-4000-8000-000000000002', 'DAIRY', 'Dairy', true, 20),
  ('d1000000-0000-4000-8000-000000000003', 'BAKERY', 'Bakery', true, 30),
  ('d1000000-0000-4000-8000-000000000004', 'PANTRY', 'Pantry', true, 40),
  ('d1000000-0000-4000-8000-000000000005', 'DELI_KITCHEN', 'Deli / Production', true, 50),
  ('d1000000-0000-4000-8000-000000000006', 'GROCERY', 'Grocery', true, 60)
ON CONFLICT ("code") DO NOTHING;

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

COMMIT;
