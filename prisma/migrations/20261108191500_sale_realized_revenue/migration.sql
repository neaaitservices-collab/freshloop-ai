-- Additive sale-price history. Nullable on purpose.
-- Null means the original realized price was not recorded (legacy rows).
-- Do not backfill from products."retailPrice" (current shelf price) or from
-- "Unit_Cost_At_Time" (cost on POS_Sale and on every non-sale movement; only
-- some older Sale rows happen to store a price there).

ALTER TABLE "Inventory_Transactions"
  ADD COLUMN IF NOT EXISTS "realized_unit_price" DOUBLE PRECISION;

ALTER TABLE "Inventory_Transactions"
  ADD COLUMN IF NOT EXISTS "realized_line_revenue" DOUBLE PRECISION;

COMMENT ON COLUMN "Inventory_Transactions"."realized_unit_price" IS
  'Unit price charged when this sale line was written. NULL on legacy rows whose original price cannot be recovered.';

COMMENT ON COLUMN "Inventory_Transactions"."realized_line_revenue" IS
  'Line revenue in dollars captured at sale time. NULL = unknown legacy sale. Never inferred from the current shelf price. Physical waste stays on Unit_Cost_At_Time. Markdown loss stays on markdown_events.revenue_impact.';
