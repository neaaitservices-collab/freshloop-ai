-- Session, revenue, scrap, OCR draft, and receive idempotency.
--
-- credential_version defaults to 0. JWTs issued before this column have no claim and are
-- treated as version 0, so they stay valid until a password change. Password reset
-- increments the column on the existing user. A deleted user is rejected because the
-- row is gone; this migration does not rewrite or delete staff rows.
--
-- Historical product sales keep their charged price in Unit_Cost_At_Time. extended_revenue
-- is null on those rows. Bundle explosions did not store the price charged, so historical
-- POS_Sale rows contribute 0 until new bundle sales write extended_revenue.
--
-- Volumetric scrap previously added a positive Qty_Change on an arbitrary catalog SKU.
-- Rows whose Reference_ID starts with VOL-SCRAP-BUCKET copy that quantity into
-- scrap_bucket_count and set Qty_Change to 0. The bucket count is kept. Other waste
-- rows are not rewritten. Duplicate historical invoices are left in place; new posts
-- use ledger_idempotency_keys.

ALTER TABLE "staff_users" ADD COLUMN "credential_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Inventory_Transactions" ADD COLUMN "extended_revenue" DOUBLE PRECISION;
ALTER TABLE "Inventory_Transactions" ADD COLUMN "scrap_bucket_count" DOUBLE PRECISION;

UPDATE "Inventory_Transactions"
SET
  "scrap_bucket_count" = ABS("Qty_Change"),
  "Qty_Change" = 0
WHERE "Transaction_Type" = 'Waste'
  AND "Reference_ID" LIKE 'VOL-SCRAP-BUCKET%';

CREATE TABLE "invoice_ocr_drafts" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoice_ocr_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_ocr_drafts_expires_at_idx" ON "invoice_ocr_drafts"("expires_at");

CREATE TABLE "ledger_idempotency_keys" (
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledger_idempotency_keys_pkey" PRIMARY KEY ("key")
);
