-- Restore invoice line items (schema still models OCR commit lines; table was dropped in 20261021030549).

CREATE TABLE IF NOT EXISTS "invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "inventoryItemId" TEXT,
    "casePackSize" DOUBLE PRECISION,
    "subUnit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_line_items_invoiceId_fkey'
  ) THEN
    ALTER TABLE "invoice_line_items"
      ADD CONSTRAINT "invoice_line_items_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "vendor_invoices" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_line_items_inventoryItemId_fkey'
  ) THEN
    ALTER TABLE "invoice_line_items"
      ADD CONSTRAINT "invoice_line_items_inventoryItemId_fkey"
      FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "invoice_line_items_inventoryItemId_idx"
  ON "invoice_line_items"("inventoryItemId");
