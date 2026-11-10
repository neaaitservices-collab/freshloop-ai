import { InventoryLocation, Prisma, TransactionType, UnitType } from '@prisma/client';
import type { BundleSaleExecutionResult, ExplodedComponentDeduction } from '@/lib/domains/inventory/ledger';
import type { RecordSaleResult } from '@/lib/domains/inventory/recordSale';

type KeyDb = Prisma.TransactionClient | {
  store: { findFirst: (args: object) => Promise<{ id: string } | null> };
  inventoryTransaction: Prisma.TransactionClient['inventoryTransaction'];
  product: Prisma.TransactionClient['product'];
};

/** Stable ledger key. Store scope keeps one mutation id from replaying another store. */
export function saleIdempotencyKey(storeId: string, mutationId: string): string {
  return `sale:${storeId}:${mutationId.trim()}`;
}

export async function saleStoreId(db: { store: { findFirst: (args: object) => Promise<{ id: string } | null> } }): Promise<string> {
  const store = await db.store.findFirst({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return store?.id ?? 'default';
}

export async function replayProductSale(
  db: KeyDb,
  referenceId: string
): Promise<(RecordSaleResult & { idempotent: true }) | null> {
  const row = await db.inventoryTransaction.findFirst({
    where: { referenceId, transactionType: TransactionType.Sale },
    orderBy: { timestamp: 'asc' },
  });
  if (!row) return null;
  const product = await db.product.findUnique({
    where: { id: row.productId },
    select: { name: true },
  });
  const quantitySold = Math.abs(row.qtyChange);
  const unitPrice = row.realizedUnitPrice ?? row.unitCostAtTime;
  return {
    idempotent: true,
    transactionId: row.id,
    productId: row.productId,
    productName: product?.name ?? row.productId,
    quantitySold,
    unitPrice,
    grossRevenue: row.realizedLineRevenue ?? Number((unitPrice * quantitySold).toFixed(2)),
    location: row.fromLocation ?? InventoryLocation.Retail_Floor,
  };
}

export async function replayBundleSale(
  db: KeyDb,
  referenceId: string,
  bundle: { id: string; name: string; bundleSku: string; bundlePrice: number }
): Promise<(BundleSaleExecutionResult & { idempotent: true }) | null> {
  const transactions = await db.inventoryTransaction.findMany({
    where: { referenceId, transactionType: TransactionType.POS_Sale },
    orderBy: { timestamp: 'asc' },
  });
  if (transactions.length === 0) return null;
  const products = await db.product.findMany({
    where: { id: { in: transactions.map((row) => row.productId) } },
    select: { id: true, name: true, unitType: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  const deductions: ExplodedComponentDeduction[] = transactions.map((row) => {
    const product = byId.get(row.productId);
    const qtyDeducted = Math.abs(row.qtyChange);
    const unitCostAtTime = row.unitCostAtTime;
    return {
      productId: row.productId,
      productName: product?.name ?? row.productId,
      unitType: product?.unitType ?? UnitType.UNIT,
      qtyDeducted,
      unitCostAtTime,
      lineCogs: Number((qtyDeducted * unitCostAtTime).toFixed(4)),
      transactionId: row.id,
    };
  });
  const totalExplodedCogs = Number(deductions.reduce((sum, row) => sum + row.lineCogs, 0).toFixed(2));
  const header = transactions.find((row) => row.extendedRevenue != null)?.extendedRevenue;
  const bundleGrossRevenue = header ?? bundle.bundlePrice;
  const realizedGrossMarginPct =
    bundleGrossRevenue > 0
      ? Number((((bundleGrossRevenue - totalExplodedCogs) / bundleGrossRevenue) * 100).toFixed(2))
      : 0;
  return {
    idempotent: true,
    bundleId: bundle.id,
    bundleName: bundle.name,
    bundleSku: bundle.bundleSku,
    externalRef: referenceId,
    quantitySold: 1,
    bundleGrossRevenue,
    totalExplodedCogs,
    realizedGrossMarginPct,
    deductions,
    transactions,
    executedAt: transactions[0]!.timestamp.toISOString(),
  };
}
