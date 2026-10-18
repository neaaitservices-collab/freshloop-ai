-- FreshLoop AI Initial Database Migration (Supabase / PostgreSQL)

-- Create Enums
CREATE TYPE "Department" AS ENUM ('PRODUCE', 'DAIRY', 'BAKERY', 'PANTRY');
CREATE TYPE "InventoryStatus" AS ENUM ('FRESH', 'WARNING', 'PULL_RESCUE', 'MARKDOWN', 'DISCARDED');
CREATE TYPE "TargetAction" AS ENUM ('KITCHEN_RESCUE', 'MARKDOWN', 'DISCARD');
CREATE TYPE "RecipeStatus" AS ENUM ('PROPOSED', 'IN_KITCHEN', 'COMPLETED');

-- Create Vendor Invoices Table
CREATE TABLE "vendor_invoices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vendorName" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "departmentBreakdown" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "rawOcrJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create Invoice Line Items Table
CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "inventoryItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoice_line_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "vendor_invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create Inventory Items Table
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "receivedCost" DOUBLE PRECISION NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "condition" TEXT NOT NULL,
    "status" "InventoryStatus" NOT NULL DEFAULT 'FRESH',
    "pullThresholdDays" INTEGER NOT NULL DEFAULT 3,
    "location" TEXT NOT NULL DEFAULT 'Main Storage',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create Voice Logs Table
CREATE TABLE "voice_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transcript" TEXT NOT NULL,
    "audioDurationSec" DOUBLE PRECISION,
    "parsedData" JSONB NOT NULL,
    "targetAction" "TargetAction" NOT NULL DEFAULT 'KITCHEN_RESCUE',
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create Recipe Fusions Table
CREATE TABLE "recipe_fusions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "ingredientsUsed" JSONB NOT NULL,
    "estimatedYield" TEXT NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL,
    "targetRetailPrice" DOUBLE PRECISION NOT NULL,
    "grossMarginPct" DOUBLE PRECISION NOT NULL,
    "instructions" TEXT NOT NULL,
    "status" "RecipeStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create Indices
CREATE INDEX "inventory_items_status_idx" ON "inventory_items"("status");
CREATE INDEX "inventory_items_department_idx" ON "inventory_items"("department");
CREATE INDEX "inventory_items_expirationDate_idx" ON "inventory_items"("expirationDate");
