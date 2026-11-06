/*
  Warnings:

  - You are about to drop the column `allergens` on the `recipes` table. All the data in the column will be lost.
  - You are about to drop the column `chefTips` on the `recipes` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `recipes` table. All the data in the column will be lost.
  - You are about to drop the column `restrictedToRole` on the `recipes` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[posSystem,externalSku]` on the table `pos_mappings` will be added. If there are existing duplicate values, this will fail.
  - Made the column `instructions` on table `recipes` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "pos_mappings_externalSku_key";

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "pos_mappings" ALTER COLUMN "posSystem" SET DEFAULT 'DEFAULT';

-- AlterTable
ALTER TABLE "recipe_fusions" ADD COLUMN     "recipeId" TEXT;

-- AlterTable
ALTER TABLE "recipes" DROP COLUMN "allergens",
DROP COLUMN "chefTips",
DROP COLUMN "isActive",
DROP COLUMN "restrictedToRole",
ALTER COLUMN "instructions" SET NOT NULL,
ALTER COLUMN "instructions" SET DEFAULT '';

-- AlterTable
ALTER TABLE "staff_users" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "inventory_items_receivedDate_idx" ON "inventory_items"("receivedDate");

-- CreateIndex
CREATE INDEX "inventory_items_productId_idx" ON "inventory_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_mappings_posSystem_externalSku_key" ON "pos_mappings"("posSystem", "externalSku");

-- CreateIndex
CREATE INDEX "recipe_fusions_status_idx" ON "recipe_fusions"("status");

-- CreateIndex
CREATE INDEX "recipe_fusions_category_idx" ON "recipe_fusions"("category");

-- CreateIndex
CREATE INDEX "recipe_fusions_recipeId_idx" ON "recipe_fusions"("recipeId");

-- CreateIndex
CREATE INDEX "recipes_status_idx" ON "recipes"("status");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_fusions" ADD CONSTRAINT "recipe_fusions_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Inventory_Transactions_Product_ID_Transaction_Type_timestamp_id" RENAME TO "Inventory_Transactions_Product_ID_Transaction_Type_timestam_idx";

-- RenameIndex
ALTER INDEX "Inventory_Transactions_Transaction_Type_To_Location_timestamp_i" RENAME TO "Inventory_Transactions_Transaction_Type_To_Location_timesta_idx";

-- RenameIndex
ALTER INDEX "inventory_lots_product_id_location_expiration_date_received__id" RENAME TO "inventory_lots_product_id_location_expiration_date_received_idx";
