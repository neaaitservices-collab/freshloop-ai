-- Production batch identity. Creates an empty table; no existing rows are rewritten.
-- Apply this migration before the app version that requires operation_id on
-- POST /api/manufacturing. Older app versions ignore the table.
-- The row is inserted in the same transaction as the batch ledger rows, so a
-- failed batch leaves no key and the same operation id can be retried.

CREATE TABLE "manufacturing_operations" (
    "id" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "batch_reference_id" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manufacturing_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "manufacturing_operations_batch_reference_id_key"
  ON "manufacturing_operations"("batch_reference_id");
