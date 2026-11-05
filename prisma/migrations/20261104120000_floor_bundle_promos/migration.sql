-- CreateTable
CREATE TABLE "floor_bundle_promos" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "min_units" DOUBLE PRECISION NOT NULL,
    "bundle_price" DOUBLE PRECISION NOT NULL,
    "label" TEXT,
    "created_by_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floor_bundle_promos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "floor_bundle_promos_product_id_is_active_idx" ON "floor_bundle_promos"("product_id", "is_active");

-- CreateIndex
CREATE INDEX "floor_bundle_promos_is_active_updated_at_idx" ON "floor_bundle_promos"("is_active", "updated_at");

-- AddForeignKey
ALTER TABLE "floor_bundle_promos" ADD CONSTRAINT "floor_bundle_promos_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
