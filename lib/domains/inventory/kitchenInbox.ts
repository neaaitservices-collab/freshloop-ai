import { InventoryLocation, TransactionType } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { getStockLevels } from '@/lib/domains/inventory/stock';

export interface KitchenInboxRow {
  id: string;
  productId: string;
  name: string;
  unitType: string;
  qtyReceived: number;
  lastReceivedAt: string;
  kitchenPrepQty: number;
  staffName: string;
}

/** Positive Rescue into production prep. The matching negative floor leg is not a receipt. */
export function isInboundProductionTransfer(row: {
  transactionType: string;
  toLocation: string;
  qtyChange: number;
}): boolean {
  return row.transactionType === 'Rescue' && row.toLocation === 'Kitchen_Prep' && row.qtyChange > 0;
}

export function kitchenInboxReceiptQty(
  rows: Array<{ productId: string; qtyChange: number }>
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!(row.qtyChange > 0)) continue;
    totals.set(row.productId, (totals.get(row.productId) ?? 0) + row.qtyChange);
  }
  return totals;
}

export async function getKitchenInbox(
  sinceHours = 24,
  range?: { startUtc: Date; endUtc: Date } | null
): Promise<KitchenInboxRow[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const timestamp = range
    ? { gte: range.startUtc, lt: range.endUtc }
    : { gte: since };

  const transactions = await prisma.inventoryTransaction.findMany({
    where: {
      transactionType: TransactionType.Rescue,
      toLocation: InventoryLocation.Kitchen_Prep,
      timestamp,
    },
    include: { product: true },
    orderBy: { timestamp: 'desc' },
  });

  const inbound = transactions.filter((tx) => tx.qtyChange > 0);
  if (inbound.length === 0) return [];

  const staffIds = [...new Set(inbound.map((tx) => tx.staffId).filter((id) => id.trim().length > 0))];
  const people = staffIds.length
    ? await prisma.user.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, name: true },
      })
    : [];
  const staffNames = new Map(people.map((person) => [person.id, person.name]));

  const levels = await getStockLevels();
  const prepQty = new Map(levels.map((row) => [row.productId, row.kitchenPrepQty]));

  return inbound
    .map((tx) => ({
      id: tx.id,
      productId: tx.productId,
      name: tx.product.name,
      unitType: tx.product.unitType,
      qtyReceived: Number(tx.qtyChange.toFixed(2)),
      lastReceivedAt: tx.timestamp.toISOString(),
      kitchenPrepQty: prepQty.get(tx.productId) ?? 0,
      staffName: staffNames.get(tx.staffId)?.trim() || 'Floor',
    }))
    .sort((a, b) => b.lastReceivedAt.localeCompare(a.lastReceivedAt));
}
