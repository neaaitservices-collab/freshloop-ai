-- Lines created after a legacy adoption are not held.
-- Does not delete ledger rows or idempotency keys.

ALTER TABLE "supplier_invoice_lines"
ADD COLUMN "held_by_legacy" BOOLEAN NOT NULL DEFAULT false;
