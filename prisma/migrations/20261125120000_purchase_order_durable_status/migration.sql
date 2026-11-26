-- Durable supplier purchase orders.
-- Run this migration before deploying the application code that writes these columns.
-- The new client selects product_ids, updated_at, and cycle_key even for the existing mailto log.
-- Rolling that code back after rows with status APPROVED exist breaks the previous client,
-- which does not know the APPROVED enum value.
--
-- updated_at DEFAULT CURRENT_TIMESTAMP also backfills existing mailto rows with the
-- migration time. That backfill is cosmetic; those rows were not status-tracked before.
ALTER TYPE "PurchaseOrderEmailStatus" ADD VALUE 'APPROVED';

ALTER TABLE "purchase_order_emails"
  ADD COLUMN "product_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "purchase_order_emails_supplier_id_updated_at_idx"
  ON "purchase_order_emails"("supplier_id", "updated_at");

-- One open cycle per supplier and line key. Closed cycles keep their rows, so the
-- same lines can be ordered again. Existing rows each get their own cycle id.
ALTER TABLE "purchase_order_emails"
  ADD COLUMN "cycle_key" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

DROP INDEX "purchase_order_emails_supplier_id_line_key_key";

CREATE UNIQUE INDEX "purchase_order_emails_supplier_id_line_key_cycle_key_key"
  ON "purchase_order_emails"("supplier_id", "line_key", "cycle_key");
