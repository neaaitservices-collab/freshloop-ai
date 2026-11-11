-- CreateEnum
CREATE TYPE "SupplierActivityType" AS ENUM ('PRICE_CHANGE', 'CREDIT', 'SHORT_SHIP', 'QUALITY_REJECT', 'LATE_DELIVERY', 'NOTE');

-- CreateEnum
CREATE TYPE "SupplierActivitySource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "SupplierCreditStatus" AS ENUM ('OPEN', 'RECEIVED');

-- CreateEnum
CREATE TYPE "SupplierCreditReason" AS ENUM ('SHORT', 'DAMAGED', 'QUALITY', 'PRICING', 'OTHER');

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "priceChangeThresholdPct" DOUBLE PRECISION NOT NULL DEFAULT 8;

-- CreateTable
CREATE TABLE "supplier_activities" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "type" "SupplierActivityType" NOT NULL,
    "product_id" TEXT,
    "vendor_invoice_id" TEXT,
    "invoice_ref" TEXT,
    "amount" DOUBLE PRECISION,
    "old_cost" DOUBLE PRECISION,
    "new_cost" DOUBLE PRECISION,
    "qty" DOUBLE PRECISION,
    "reason" "SupplierCreditReason",
    "credit_status" "SupplierCreditStatus",
    "resolved_at" TIMESTAMP(3),
    "note" TEXT,
    "actor_id" TEXT,
    "source" "SupplierActivitySource" NOT NULL,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_activities_supplier_id_created_at_idx" ON "supplier_activities"("supplier_id", "created_at");

-- CreateIndex
CREATE INDEX "supplier_activities_supplier_id_type_credit_status_idx" ON "supplier_activities"("supplier_id", "type", "credit_status");

-- AddForeignKey
ALTER TABLE "supplier_activities" ADD CONSTRAINT "supplier_activities_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_activities" ADD CONSTRAINT "supplier_activities_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_activities" ADD CONSTRAINT "supplier_activities_vendor_invoice_id_fkey" FOREIGN KEY ("vendor_invoice_id") REFERENCES "vendor_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

