-- Supplier-scoped invoice documents and the line UUIDs assigned on first sight.
-- Does not rewrite receiving_deliveries or inventory history.
-- Invoice date is stored and is not part of the unique key.

CREATE TABLE "supplier_invoice_documents" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "invoice_key" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_invoice_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_invoice_documents_supplier_id_invoice_key_key"
ON "supplier_invoice_documents"("supplier_id", "invoice_key");

CREATE INDEX "supplier_invoice_documents_supplier_id_idx"
ON "supplier_invoice_documents"("supplier_id");

ALTER TABLE "supplier_invoice_documents"
ADD CONSTRAINT "supplier_invoice_documents_supplier_id_fkey"
FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "supplier_invoice_lines" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "document_id" TEXT NOT NULL,
    "printed_key" TEXT NOT NULL,
    "occurrence" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    CONSTRAINT "supplier_invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_invoice_lines_document_id_printed_key_occurrence_key"
ON "supplier_invoice_lines"("document_id", "printed_key", "occurrence");

CREATE INDEX "supplier_invoice_lines_document_id_idx"
ON "supplier_invoice_lines"("document_id");

ALTER TABLE "supplier_invoice_lines"
ADD CONSTRAINT "supplier_invoice_lines_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "supplier_invoice_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
