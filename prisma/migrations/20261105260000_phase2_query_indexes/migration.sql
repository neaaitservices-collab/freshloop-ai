-- Phase 2: invoice line lookups + ledger hot-path filters
CREATE INDEX IF NOT EXISTS "invoice_line_items_invoiceId_idx" ON "invoice_line_items"("invoiceId");

CREATE INDEX IF NOT EXISTS "Inventory_Transactions_Product_ID_Transaction_Type_timestamp_idx"
  ON "Inventory_Transactions"("Product_ID", "Transaction_Type", "timestamp");

CREATE INDEX IF NOT EXISTS "Inventory_Transactions_Transaction_Type_To_Location_timestamp_idx"
  ON "Inventory_Transactions"("Transaction_Type", "To_Location", "timestamp");
