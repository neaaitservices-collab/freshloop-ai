-- Per-SKU pull window override (2, 3, or 4 days). NULL = store default.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "pull_sensitivity_days" INTEGER;
