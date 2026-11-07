-- API latency: catalog scans, store settings, ledger aggregation

CREATE INDEX IF NOT EXISTS "products_catalogActive_isManufactured_idx"
  ON "products"("catalogActive", "isManufactured");

CREATE INDEX IF NOT EXISTS "store_settings_updatedAt_idx"
  ON "store_settings"("updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "Inventory_Transactions_Product_ID_From_To_idx"
  ON "Inventory_Transactions"("Product_ID", "From_Location", "To_Location");
