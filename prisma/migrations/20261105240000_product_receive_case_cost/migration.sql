-- Canonical case cost from invoice receive or catalog override (display + economics).
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "receive_case_cost" DOUBLE PRECISION;
