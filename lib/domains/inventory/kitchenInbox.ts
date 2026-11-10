import { InventoryLocation, TransactionType } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { getStockLevels } from '@/lib/domains/inventory/stock';
import { RANGE_ROW_LIMIT, rangeIsTruncated } from '@/lib/domains/stats/rangeLimit';

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

export interface KitchenInboxProductTotal {
  productId: string;
  qtyReceived: number;
  lastReceivedAt: string;
}

export interface KitchenInboxPage {
  items: KitchenInboxRow[];
  limit: number;
  truncated: boolean;
  totalCount: number;
  totalQty: number;
  productTotals: KitchenInboxProductTotal[];
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
  range?: { startUtc: Date; endUtc: Date } | null,
  limit = RANGE_ROW_LIMIT
): Promise<KitchenInboxPage> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const timestamp = range
    ? { gte: range.startUtc, lt: range.endUtc }
    : { gte: since };
  const where = {
    transactionType: TransactionType.Rescue,
    toLocation: InventoryLocation.Kitchen_Prep,
    qtyChange: { gt: 0 },
    timestamp,
  };

  const [transactions, aggregate, grouped] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where,
      include: { product: true },
      orderBy: { timestamp: 'desc' },
      take: limit,
    }),
    prisma.inventoryTransaction.aggregate({
      where,
      _sum: { qtyChange: true },
      _count: { _all: true },
    }),
    prisma.inventoryTransaction.groupBy({
      by: ['productId'],
      where,
      _sum: { qtyChange: true },
      _max: { timestamp: true },
    }),
  ]);

  const totalCount = aggregate._count._all;
  const totalQty = Number((aggregate._sum.qtyChange ?? 0).toFixed(2));
  const staffIds = [
    ...new Set(transactions.map((tx) => tx.staffId).filter((id) => id.trim().length > 0)),
  ];
  const people = staffIds.length
    ? await prisma.user.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, name: true },
      })
    : [];
  const staffNames = new Map(people.map((person) => [person.id, person.name]));
  const levels = await getStockLevels();
  const prepQty = new Map(levels.map((row) => [row.productId, row.kitchenPrepQty]));

  return {
    items: transactions.map((tx) => ({
      id: tx.id,
      productId: tx.productId,
      name: tx.product.name,
      unitType: tx.product.unitType,
      qtyReceived: Number(tx.qtyChange.toFixed(2)),
      lastReceivedAt: tx.timestamp.toISOString(),
      kitchenPrepQty: prepQty.get(tx.productId) ?? 0,
      staffName: staffNames.get(tx.staffId)?.trim() || 'Floor',
    })),
    limit,
    truncated: rangeIsTruncated(totalCount, limit),
    totalCount,
    totalQty,
    productTotals: grouped.map((row) => ({
      productId: row.productId,
      qtyReceived: Number((row._sum.qtyChange ?? 0).toFixed(2)),
      lastReceivedAt: (row._max.timestamp ?? new Date(0)).toISOString(),
    })),
  };
}
