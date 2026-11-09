-- Persisted receiving delivery UUIDs.
-- Does not delete or rewrite Inventory_Transactions or ledger_idempotency_keys.
-- Historical recv:sheet-row-N keys stay in place and are not treated as new deliveries.

CREATE TABLE "receiving_deliveries" (
    "id" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "product_id" TEXT,
    "cases_received" DOUBLE PRECISION NOT NULL,
    "case_cost" DOUBLE PRECISION NOT NULL,
    "pack_size" DOUBLE PRECISION NOT NULL,
    "split_factor" DOUBLE PRECISION NOT NULL,
    "units_added" DOUBLE PRECISION NOT NULL,
    "transaction_id" TEXT,
    "catalog_product_id" TEXT,
    "product_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "receiving_deliveries_pkey" PRIMARY KEY ("id")
);
