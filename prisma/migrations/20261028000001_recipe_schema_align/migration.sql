-- Align recipes table with kitchen BOM app fields (status + portion size)
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "portionSize" TEXT;
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "status" "RecipeStatus" NOT NULL DEFAULT 'PROPOSED';

ALTER TABLE "recipes" ALTER COLUMN "category" DROP NOT NULL;
ALTER TABLE "recipes" ALTER COLUMN "instructions" DROP NOT NULL;
