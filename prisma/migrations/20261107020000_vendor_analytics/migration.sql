-- Vendor analytics: price variance logs, quality events, invoice line OCR metrics
ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "ocr_line_confidence" DOUBLE PRECISION;
ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "cost_variance_pct" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "price_variance_logs" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "product_id" TEXT,
    "vendor_invoice_id" TEXT,
    "item_name" TEXT NOT NULL,
    "scanned_unit_cost" DOUBLE PRECISION NOT NULL,
    "benchmark_cost" DOUBLE PRECISION NOT NULL,
    "variance_pct" DOUBLE PRECISION NOT NULL,
    "threshold_pct" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "price_variance_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "supplier_quality_events" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "product_id" TEXT,
    "vendor_invoice_id" TEXT,
    "receiving_disposition_id" TEXT,
    "item_name" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_quality_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "receiving_dispositions" ADD COLUMN IF NOT EXISTS "supplier_id" TEXT;

CREATE INDEX IF NOT EXISTS "price_variance_logs_supplier_id_created_at_idx" ON "price_variance_logs"("supplier_id", "created_at");
CREATE INDEX IF NOT EXISTS "price_variance_logs_product_id_idx" ON "price_variance_logs"("product_id");
CREATE INDEX IF NOT EXISTS "price_variance_logs_vendor_invoice_id_idx" ON "price_variance_logs"("vendor_invoice_id");

CREATE INDEX IF NOT EXISTS "supplier_quality_events_supplier_id_created_at_idx" ON "supplier_quality_events"("supplier_id", "created_at");
CREATE INDEX IF NOT EXISTS "supplier_quality_events_event_type_idx" ON "supplier_quality_events"("event_type");

CREATE INDEX IF NOT EXISTS "receiving_dispositions_supplier_id_idx" ON "receiving_dispositions"("supplier_id");

ALTER TABLE "price_variance_logs" ADD CONSTRAINT "price_variance_logs_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_variance_logs" ADD CONSTRAINT "price_variance_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "price_variance_logs" ADD CONSTRAINT "price_variance_logs_vendor_invoice_id_fkey" FOREIGN KEY ("vendor_invoice_id") REFERENCES "vendor_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "supplier_quality_events" ADD CONSTRAINT "supplier_quality_events_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_quality_events" ADD CONSTRAINT "supplier_quality_events_receiving_disposition_id_fkey" FOREIGN KEY ("receiving_disposition_id") REFERENCES "receiving_dispositions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "receiving_dispositions" ADD CONSTRAINT "receiving_dispositions_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
