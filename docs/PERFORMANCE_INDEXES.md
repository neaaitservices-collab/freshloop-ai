# PostgreSQL indexes (API latency)

FreshLoop uses **Prisma + PostgreSQL** (not Supabase client). Apply migrations with `npx prisma migrate deploy` in production.

## Migration `20261107143000_api_latency_indexes`

| Index | Rationale |
|-------|-----------|
| `products(catalogActive, isManufactured)` | Stock level aggregation and catalog name index filter active purchasable SKUs. |
| `store_settings(updatedAt DESC)` | `findLatestStoreSetting()` on every stock/KPI path. |
| `Inventory_Transactions(Product_ID, From_Location, To_Location)` | On-hand aggregation and `getCurrentStock` location filters. |

## Existing high-traffic indexes (reference)

```sql
-- Already in schema / prior migrations
CREATE INDEX IF NOT EXISTS "Inventory_Transactions_Product_ID_timestamp_idx"
  ON "Inventory_Transactions"("Product_ID", "timestamp");
CREATE INDEX IF NOT EXISTS "Inventory_Transactions_Transaction_Type_timestamp_idx"
  ON "Inventory_Transactions"("Transaction_Type", "timestamp");
CREATE INDEX IF NOT EXISTS "products_name_idx" ON "products"("name");
CREATE INDEX IF NOT EXISTS "staff_users_role_idx" ON "staff_users"("role");
CREATE INDEX IF NOT EXISTS "recipes_status_idx" ON "recipes"("status");
```

## Application-side caching (no SQL)

- **Stock levels** (`getStockLevels`, `getStockLevelsWithPosSales`): 60s in-process TTL; invalidated on ledger writes via `invalidateInventoryCaches()`.
- **Buy list / orders** (`getBuyListLevelsWithForecast`): 60s default config; React `cache()` on `/orders` RSC.
- **Production bootstrap** (`loadProductionBootstrapData`): 45s; slim recipe `select` (no bloated joins).
- **Waste KPI** (`getCachedRealTimeWastePct`): 30s for default window.
- **Staff directory** (`GET /api/users`): 30s single-query roster with `hourlyRate` on `User`.
- **Platform settings**: 30s via `getPlatformSettings()`.
- **On-hand lookup** (`GET /api/inventory/on-hand`): cached catalog names + targeted `ILIKE` prefix search before fuzzy match.
