import { prisma } from '@/lib/db/prisma';
import { computeBundleDealEconomics } from '@/lib/domains/pricing/bundleDealEconomics';
import type { FloorBundlePromoView } from '@/lib/domains/pricing/floorBundlePromoTypes';

export type { FloorBundlePromoView } from '@/lib/domains/pricing/floorBundlePromoTypes';

function toView(row: {
  id: string;
  productId: string;
  minUnits: number;
  bundlePrice: number;
  label: string | null;
  isActive: boolean;
  updatedAt: Date;
  product: {
    name: string;
    standardCost: number | null;
    retailPrice: number | null;
    regularRetailPrice: number | null;
  };
}): FloorBundlePromoView {
  const unitCost = row.product.standardCost ?? 0;
  const regularUnitPrice = row.product.regularRetailPrice ?? row.product.retailPrice;
  return {
    id: row.id,
    productId: row.productId,
    productName: row.product.name,
    minUnits: row.minUnits,
    bundlePrice: row.bundlePrice,
    label: row.label,
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
    economics: computeBundleDealEconomics({
      minUnits: row.minUnits,
      bundlePrice: row.bundlePrice,
      unitCost,
      regularUnitPrice,
    }),
  };
}

const productSelect = {
  name: true,
  standardCost: true,
  retailPrice: true,
  regularRetailPrice: true,
} as const;

export async function listFloorBundlePromos(activeOnly = true): Promise<FloorBundlePromoView[]> {
  const rows = await prisma.floorBundlePromo.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    include: { product: { select: productSelect } },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(toView);
}

export async function getFloorBundlePromoForProduct(
  productId: string
): Promise<FloorBundlePromoView | null> {
  const row = await prisma.floorBundlePromo.findFirst({
    where: { productId, isActive: true },
    orderBy: { updatedAt: 'desc' },
    include: { product: { select: productSelect } },
  });
  return row ? toView(row) : null;
}

export async function upsertFloorBundlePromo(input: {
  productId: string;
  minUnits: number;
  bundlePrice: number;
  label?: string | null;
  createdById: string;
}): Promise<FloorBundlePromoView> {
  const minUnits = Math.floor(input.minUnits);
  if (!Number.isFinite(minUnits) || minUnits < 2) {
    throw new Error('Bundle promos require at least 2 units.');
  }
  const bundlePrice = Number(input.bundlePrice);
  if (!Number.isFinite(bundlePrice) || bundlePrice <= 0) {
    throw new Error('Enter a bundle price greater than zero.');
  }

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new Error('Item was not found.');

  const defaultLabel = `${minUnits} for $${bundlePrice.toFixed(2)}`;

  await prisma.floorBundlePromo.updateMany({
    where: { productId: input.productId, isActive: true },
    data: { isActive: false },
  });

  const row = await prisma.floorBundlePromo.create({
    data: {
      productId: input.productId,
      minUnits,
      bundlePrice,
      label: input.label?.trim() || defaultLabel,
      createdById: input.createdById,
      isActive: true,
    },
    include: { product: { select: productSelect } },
  });

  return toView(row);
}

export async function deactivateFloorBundlePromo(id: string): Promise<void> {
  await prisma.floorBundlePromo.updateMany({
    where: { id },
    data: { isActive: false },
  });
}
