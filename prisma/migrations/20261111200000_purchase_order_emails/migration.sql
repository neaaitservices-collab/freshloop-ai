-- CreateEnum
CREATE TYPE "PurchaseOrderEmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "purchase_order_emails" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "supplier_name" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "reply_to" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "line_key" TEXT NOT NULL,
    "status" "PurchaseOrderEmailStatus" NOT NULL,
    "provider_id" TEXT,
    "actor_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_order_emails_supplier_id_created_at_idx" ON "purchase_order_emails"("supplier_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_emails_supplier_id_line_key_key" ON "purchase_order_emails"("supplier_id", "line_key");

-- AddForeignKey
ALTER TABLE "purchase_order_emails" ADD CONSTRAINT "purchase_order_emails_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
