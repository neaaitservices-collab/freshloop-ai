-- Date, spelling, and legacy-receipt decisions for supplier invoices.
-- Does not delete ledger rows, idempotency keys, or inventory history.
-- Documents without invoice_date_key stay unpostable.

ALTER TABLE "supplier_invoice_documents"
ADD COLUMN "invoice_key_compact" TEXT,
ADD COLUMN "invoice_date_key" TEXT,
ADD COLUMN "legacy_key" TEXT,
ADD COLUMN "adopted_at" TIMESTAMP(3),
ADD COLUMN "adopted_by" TEXT;

UPDATE "supplier_invoice_documents"
SET "invoice_key_compact" = regexp_replace(lower("invoice_key"), '\s+', '', 'g')
WHERE "invoice_key_compact" IS NULL;

UPDATE "supplier_invoice_documents"
SET "invoice_date_key" = lower(btrim("invoice_date"))
WHERE "invoice_date_key" IS NULL
  AND "invoice_date" IS NOT NULL
  AND btrim("invoice_date") <> '';

ALTER TABLE "supplier_invoice_documents"
ALTER COLUMN "invoice_key_compact" SET NOT NULL;

DROP INDEX "supplier_invoice_documents_supplier_id_invoice_key_key";

CREATE UNIQUE INDEX "supplier_invoice_documents_supplier_id_invoice_key_invoice_date_key_key"
ON "supplier_invoice_documents"("supplier_id", "invoice_key", "invoice_date_key");

CREATE INDEX "supplier_invoice_documents_supplier_id_invoice_key_compact_idx"
ON "supplier_invoice_documents"("supplier_id", "invoice_key_compact");

CREATE TABLE "supplier_invoice_date_links" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "date_key" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_invoice_date_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_invoice_date_links_document_id_date_key_key"
ON "supplier_invoice_date_links"("document_id", "date_key");

CREATE INDEX "supplier_invoice_date_links_date_key_idx"
ON "supplier_invoice_date_links"("date_key");

ALTER TABLE "supplier_invoice_date_links"
ADD CONSTRAINT "supplier_invoice_date_links_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "supplier_invoice_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "supplier_invoice_key_aliases" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "invoice_key" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_invoice_key_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_invoice_key_aliases_document_id_invoice_key_key"
ON "supplier_invoice_key_aliases"("document_id", "invoice_key");

CREATE INDEX "supplier_invoice_key_aliases_invoice_key_idx"
ON "supplier_invoice_key_aliases"("invoice_key");

ALTER TABLE "supplier_invoice_key_aliases"
ADD CONSTRAINT "supplier_invoice_key_aliases_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "supplier_invoice_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "supplier_invoice_line_aliases" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "printed_key" TEXT NOT NULL,
    "occurrence" INTEGER NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_invoice_line_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_invoice_line_aliases_document_id_printed_key_occurrence_key"
ON "supplier_invoice_line_aliases"("document_id", "printed_key", "occurrence");

CREATE INDEX "supplier_invoice_line_aliases_line_id_idx"
ON "supplier_invoice_line_aliases"("line_id");

ALTER TABLE "supplier_invoice_line_aliases"
ADD CONSTRAINT "supplier_invoice_line_aliases_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "supplier_invoice_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_invoice_line_aliases"
ADD CONSTRAINT "supplier_invoice_line_aliases_line_id_fkey"
FOREIGN KEY ("line_id") REFERENCES "supplier_invoice_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "supplier_invoice_events" (
    "id" TEXT NOT NULL,
    "document_id" TEXT,
    "supplier_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_invoice_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_invoice_events_supplier_id_created_at_idx"
ON "supplier_invoice_events"("supplier_id", "created_at");

CREATE INDEX "supplier_invoice_events_document_id_idx"
ON "supplier_invoice_events"("document_id");

ALTER TABLE "supplier_invoice_events"
ADD CONSTRAINT "supplier_invoice_events_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "supplier_invoice_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
