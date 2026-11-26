-- Durable supplier purchase orders: Approved status, the product lines on the order, and a timestamp for status changes.
ALTER TYPE "PurchaseOrderEmailStatus" ADD VALUE 'APPROVED';

ALTER TABLE "purchase_order_emails"
  ADD COLUMN "product_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
