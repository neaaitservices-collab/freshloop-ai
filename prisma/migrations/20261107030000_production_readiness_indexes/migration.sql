-- Production readiness: POS lookup, vendor windows, credits inbox, auth cascades

CREATE INDEX IF NOT EXISTS "pos_mappings_externalSku_isActive_idx"
  ON "pos_mappings"("externalSku", "isActive");

CREATE INDEX IF NOT EXISTS "vendor_invoices_supplier_id_createdAt_idx"
  ON "vendor_invoices"("supplier_id", "createdAt");

CREATE INDEX IF NOT EXISTS "invoice_line_items_invoiceId_createdAt_idx"
  ON "invoice_line_items"("invoiceId", "createdAt");

CREATE INDEX IF NOT EXISTS "receiving_dispositions_reason_status_createdAt_idx"
  ON "receiving_dispositions"("reason", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "receiving_dispositions_supplier_id_createdAt_idx"
  ON "receiving_dispositions"("supplier_id", "createdAt");

CREATE INDEX IF NOT EXISTS "auth_accounts_user_id_idx"
  ON "auth_accounts"("user_id");

CREATE INDEX IF NOT EXISTS "auth_sessions_user_id_idx"
  ON "auth_sessions"("user_id");

CREATE INDEX IF NOT EXISTS "supplier_quality_events_receiving_disposition_id_idx"
  ON "supplier_quality_events"("receiving_disposition_id");
