-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_key" ON "suppliers"("name");

-- AlterTable
ALTER TABLE "vendor_invoices" ADD COLUMN "supplier_id" TEXT;

-- CreateIndex
CREATE INDEX "vendor_invoices_supplier_id_idx" ON "vendor_invoices"("supplier_id");

-- AddForeignKey
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill suppliers from historical invoice vendor names
INSERT INTO "suppliers" ("id", "name", "created_at", "updated_at")
SELECT
  substr(replace(gen_random_uuid()::text, '-', ''), 1, 25),
  trimmed.name,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT TRIM("vendorName") AS name
  FROM "vendor_invoices"
  WHERE TRIM("vendorName") <> ''
) trimmed
ON CONFLICT ("name") DO NOTHING;

UPDATE "vendor_invoices" vi
SET "supplier_id" = s.id
FROM "suppliers" s
WHERE vi."supplier_id" IS NULL
  AND LOWER(TRIM(vi."vendorName")) = LOWER(TRIM(s.name));
