-- Additional read-path indexes (orders, staff directory, store scope)

CREATE INDEX IF NOT EXISTS "products_supplier_idx"
  ON "products"("supplier");

CREATE INDEX IF NOT EXISTS "store_settings_store_id_idx"
  ON "store_settings"("store_id");

CREATE INDEX IF NOT EXISTS "staff_users_role_name_idx"
  ON "staff_users"("role", "name");
