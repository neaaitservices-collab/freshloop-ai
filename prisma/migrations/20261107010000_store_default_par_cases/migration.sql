-- Store-wide default minimum stock (cases) for Orders / par alerts
ALTER TABLE "store_settings" ADD COLUMN IF NOT EXISTS "default_par_cases" INTEGER NOT NULL DEFAULT 2;
