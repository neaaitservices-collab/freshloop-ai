/*
  Warnings:

  - You are about to drop the `invoice_line_items` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('Receive', 'Sale', 'Rescue', 'Waste', 'POS_Sale');

-- CreateEnum
CREATE TYPE "InventoryLocation" AS ENUM ('External_Vendor', 'Main_Storage', 'Retail_Floor', 'Kitchen_Prep', 'Deli_Grab_N_Go', 'Customer_Out', 'Waste_Bin');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('KG', 'LBS', 'LITER', 'ML', 'UNIT', 'BUNCH', 'LOAF', 'TUB', 'CASE');

-- AlterEnum
ALTER TYPE "Department" ADD VALUE 'DELI_KITCHEN';

-- DropForeignKey
ALTER TABLE "invoice_line_items" DROP CONSTRAINT "invoice_line_items_invoiceId_fkey";

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "actualMarginPct" DOUBLE PRECISION,
ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "batchCode" TEXT,
ADD COLUMN     "casePackSize" DOUBLE PRECISION,
ADD COLUMN     "margin40Price" DOUBLE PRECISION,
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "subUnit" TEXT,
ADD COLUMN     "supplier" TEXT,
ADD COLUMN     "yieldPct" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "recipe_fusions" ADD COLUMN     "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "chefTips" TEXT,
ADD COLUMN     "prepTimeMinutes" INTEGER;

-- DropTable
DROP TABLE "invoice_line_items";

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "targetMargin" DOUBLE PRECISION NOT NULL DEFAULT 0.40,
    "unitType" "UnitType" NOT NULL DEFAULT 'UNIT',
    "casePackSize" DOUBLE PRECISION DEFAULT 1,
    "yieldPct" DOUBLE PRECISION DEFAULT 100,
    "shelfLifeDays" INTEGER NOT NULL DEFAULT 7,
    "supplier" TEXT,
    "origin" TEXT,
    "standardCost" DOUBLE PRECISION,
    "retailPrice" DOUBLE PRECISION,
    "isManufactured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory_Transactions" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "Product_ID" TEXT NOT NULL,
    "Staff_ID" TEXT NOT NULL,
    "Qty_Change" DOUBLE PRECISION NOT NULL,
    "Transaction_Type" "TransactionType" NOT NULL,
    "From_Location" "InventoryLocation" NOT NULL,
    "To_Location" "InventoryLocation" NOT NULL,
    "Unit_Cost_At_Time" DOUBLE PRECISION NOT NULL,
    "Reference_ID" TEXT,
    "expirationDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "Inventory_Transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" TEXT NOT NULL,
    "storeName" TEXT NOT NULL DEFAULT 'FreshLoop Independent Market',
    "Target_Waste_Pct" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "Scrap_Bucket_Volume_L" DOUBLE PRECISION NOT NULL DEFAULT 20.0,
    "Estimated_Weight_Per_Liter_kg" DOUBLE PRECISION NOT NULL DEFAULT 0.65,
    "defaultScrapCostPerKg" DOUBLE PRECISION NOT NULL DEFAULT 3.50,
    "pullSensitivityDays" INTEGER NOT NULL DEFAULT 3,
    "costGuardrailVariancePct" DOUBLE PRECISION NOT NULL DEFAULT 20.0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "outputProductId" TEXT NOT NULL,
    "batchYieldQty" DOUBLE PRECISION NOT NULL,
    "targetRetailPrice" DOUBLE PRECISION NOT NULL,
    "prepTimeMinutes" INTEGER NOT NULL DEFAULT 25,
    "instructions" TEXT NOT NULL,
    "chefTips" TEXT,
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "restrictedToRole" TEXT NOT NULL DEFAULT 'KITCHEN_STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_boms" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientProductId" TEXT NOT NULL,
    "requiredQty" DOUBLE PRECISION NOT NULL,
    "unit" "UnitType" NOT NULL,
    "allowVariance" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "recipe_boms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bundleSku" TEXT NOT NULL,
    "description" TEXT,
    "bundlePrice" DOUBLE PRECISION NOT NULL,
    "discountPct" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundle_items" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "bundle_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_mappings" (
    "id" TEXT NOT NULL,
    "externalSku" TEXT NOT NULL,
    "posSystem" TEXT NOT NULL DEFAULT 'SQUARE_POS',
    "productId" TEXT,
    "bundleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE INDEX "products_department_idx" ON "products"("department");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "Inventory_Transactions_Product_ID_timestamp_idx" ON "Inventory_Transactions"("Product_ID", "timestamp");

-- CreateIndex
CREATE INDEX "Inventory_Transactions_Transaction_Type_timestamp_idx" ON "Inventory_Transactions"("Transaction_Type", "timestamp");

-- CreateIndex
CREATE INDEX "Inventory_Transactions_From_Location_To_Location_idx" ON "Inventory_Transactions"("From_Location", "To_Location");

-- CreateIndex
CREATE INDEX "Inventory_Transactions_Reference_ID_idx" ON "Inventory_Transactions"("Reference_ID");

-- CreateIndex
CREATE INDEX "Inventory_Transactions_expirationDate_idx" ON "Inventory_Transactions"("expirationDate");

-- CreateIndex
CREATE INDEX "recipes_outputProductId_idx" ON "recipes"("outputProductId");

-- CreateIndex
CREATE INDEX "recipe_boms_recipeId_idx" ON "recipe_boms"("recipeId");

-- CreateIndex
CREATE INDEX "recipe_boms_ingredientProductId_idx" ON "recipe_boms"("ingredientProductId");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_boms_recipeId_ingredientProductId_key" ON "recipe_boms"("recipeId", "ingredientProductId");

-- CreateIndex
CREATE UNIQUE INDEX "bundles_bundleSku_key" ON "bundles"("bundleSku");

-- CreateIndex
CREATE INDEX "bundle_items_bundleId_idx" ON "bundle_items"("bundleId");

-- CreateIndex
CREATE INDEX "bundle_items_productId_idx" ON "bundle_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "bundle_items_bundleId_productId_key" ON "bundle_items"("bundleId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_mappings_externalSku_key" ON "pos_mappings"("externalSku");

-- CreateIndex
CREATE INDEX "pos_mappings_productId_idx" ON "pos_mappings"("productId");

-- CreateIndex
CREATE INDEX "pos_mappings_bundleId_idx" ON "pos_mappings"("bundleId");

-- AddForeignKey
ALTER TABLE "Inventory_Transactions" ADD CONSTRAINT "Inventory_Transactions_Product_ID_fkey" FOREIGN KEY ("Product_ID") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_outputProductId_fkey" FOREIGN KEY ("outputProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_boms" ADD CONSTRAINT "recipe_boms_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_boms" ADD CONSTRAINT "recipe_boms_ingredientProductId_fkey" FOREIGN KEY ("ingredientProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_mappings" ADD CONSTRAINT "pos_mappings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_mappings" ADD CONSTRAINT "pos_mappings_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
