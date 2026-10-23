import { InventoryLocation, TransactionType } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { getStockLevels } from '@/lib/domains/inventory/stock';

export interface KitchenInboxRow {
  productId: string;
  name: string;
  unitType: string;
  qtyReceived: number;
  lastReceivedAt: string;
  kitchenPrepQty: number;
}

export async function getKitchenInbox(sinceHours = 24): Promise<KitchenInboxRow[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  const transactions = await prisma.inventoryTransaction.findMany({
    where: {
      transactionType: TransactionType.Rescue,
      toLocation: InventoryLocation.Kitchen_Prep,
      timestamp: { gte: since },
    },
    include: { product: true },
    orderBy: { timestamp: 'desc' },
  });

  const byProduct = new Map<
    string,
    { qty: number; lastAt: Date; name: string; unitType: string }
  >();

  for (const tx of transactions) {
    const qty = Math.abs(tx.qtyChange);
    if (qty <= 0) continue;
    const existing = byProduct.get(tx.productId);
    if (!existing) {
      byProduct.set(tx.productId, {
        qty,
        lastAt: tx.timestamp,
        name: tx.product.name,
        unitType: tx.product.unitType,
      });
    } else {
      existing.qty += qty;
      if (tx.timestamp > existing.lastAt) existing.lastAt = tx.timestamp;
    }
  }

  if (byProduct.size === 0) return [];

  const levels = await getStockLevels();
  const prepQty = new Map(levels.map((row) => [row.productId, row.kitchenPrepQty]));

  return [...byProduct.entries()]
    .map(([productId, meta]) => ({
      productId,
      name: meta.name,
      unitType: meta.unitType,
      qtyReceived: Number(meta.qty.toFixed(2)),
      lastReceivedAt: meta.lastAt.toISOString(),
      kitchenPrepQty: prepQty.get(productId) ?? 0,
    }))
    .sort((a, b) => b.lastReceivedAt.localeCompare(a.lastReceivedAt));
}
