-- Employee hourly wage for production labor costing
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "hourly_rate_per_hour" DOUBLE PRECISION;
