-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Toronto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_lots" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "location" "InventoryLocation" NOT NULL,
    "qty_remaining" DOUBLE PRECISION NOT NULL,
    "unit_cost_at_time" DOUBLE PRECISION NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiration_date" TIMESTAMP(3),
    "receive_reference_id" TEXT,
    "receive_transaction_id" TEXT,

    CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "markdown_events" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "quantity_units" DOUBLE PRECISION NOT NULL,
    "regular_price" DOUBLE PRECISION NOT NULL,
    "markdown_price" DOUBLE PRECISION NOT NULL,
    "discount_pct" DOUBLE PRECISION NOT NULL,
    "revenue_impact" DOUBLE PRECISION NOT NULL,
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "markdown_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_slug_key" ON "stores"("slug");

-- CreateIndex
CREATE INDEX "inventory_lots_product_id_location_expiration_date_received__idx" ON "inventory_lots"("product_id", "location", "expiration_date", "received_at");

-- CreateIndex
CREATE INDEX "markdown_events_product_id_created_at_idx" ON "markdown_events"("product_id", "created_at");

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN "store_id" TEXT;

-- AddForeignKey
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markdown_events" ADD CONSTRAINT "markdown_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
