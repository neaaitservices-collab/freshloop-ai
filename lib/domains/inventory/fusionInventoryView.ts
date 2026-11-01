import type { InventoryItem, InventoryStatusType } from '@/types';
import { getStockLevels, type StockLevel } from '@/lib/domains/inventory/stock';
import { stockLevelToFusionItem } from '@/lib/domains/kitchen/prepToFusionItems';
import { prisma } from '@/lib/domains/inventory/ledger';
import type { Department } from '@prisma/client';

function departmentFromPrisma(value: Department): InventoryItem['department'] {
  const map: Record<Department, InventoryItem['department']> = {
    PRODUCE: 'PRODUCE',
    DAIRY: 'DAIRY',
    BAKERY: 'BAKERY',
    PANTRY: 'PANTRY',
    DELI_KITCHEN: 'PANTRY',
  };
  return map[value] ?? 'PRODUCE';
}

function statusForLevel(level: StockLevel, pullDays: number): InventoryStatusType {
  if (level.daysRemaining <= 0) return 'DISCARDED';
  if (level.daysRemaining <= pullDays) return 'PULL_RESCUE';
  if (level.isMarkdown) return 'MARKDOWN';
  if (level.daysRemaining <= pullDays + 1) return 'WARNING';
  return 'FRESH';
}

function levelToFloorItem(
  level: StockLevel,
  department: InventoryItem['department'],
  pullDays: number
): InventoryItem {
  const base = stockLevelToFusionItem(level, department);
  return {
    ...base,
    quantity: level.onHand,
    location: 'Retail_Floor',
    status: statusForLevel(level, pullDays),
    pullThresholdDays: pullDays,
  };
}

/**
 * Retail floor rows for fusion.
 * Default: pull-window, next-day warning, and markdown SKUs.
 * Pass `productIds` to resolve an explicit selection, including SKUs outside that window.
 */
export async function getFloorPullFusionItems(
  pullDays = 3,
  options?: { productIds?: string[] }
): Promise<InventoryItem[]> {
  const requested =
    options?.productIds && options.productIds.length > 0 ? new Set(options.productIds) : null;
  const levels = await getStockLevels().then((rows) =>
    rows.filter((row) => {
      if (!(row.onHand > 0)) return false;
      if (requested) return requested.has(row.productId);
      if (row.isMarkdown) return true;
      return row.daysRemaining <= pullDays + 1;
    })
  );
  if (levels.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: levels.map((p) => p.productId) } },
    select: { id: true, department: true },
  });
  const deptById = new Map(products.map((p) => [p.id, departmentFromPrisma(p.department)]));

  return levels.map((level) =>
    levelToFloorItem(level, deptById.get(level.productId) ?? 'PRODUCE', pullDays)
  );
}

/** All ledger-backed floor + kitchen rows (replaces legacy InventoryItem table reads). */
export async function getLedgerInventoryItems(options?: {
  status?: string;
  pullThresholdDays?: number;
}): Promise<InventoryItem[]> {
  const pullDays = options?.pullThresholdDays ?? 3;
  const levels = await getStockLevels();
  const products = await prisma.product.findMany({
    where: { id: { in: levels.map((p) => p.productId) } },
    select: { id: true, department: true },
  });
  const deptById = new Map(products.map((p) => [p.id, departmentFromPrisma(p.department)]));

  const items: InventoryItem[] = [];
  for (const level of levels) {
    if (level.onHand > 0) {
      items.push(levelToFloorItem(level, deptById.get(level.productId) ?? 'PRODUCE', pullDays));
    }
    if (level.kitchenPrepQty > 0) {
      items.push(stockLevelToFusionItem(level, deptById.get(level.productId) ?? 'PRODUCE'));
    }
  }

  const statusFilter = options?.status;
  if (statusFilter && statusFilter !== 'ALL') {
    return items.filter((item) => item.status === statusFilter);
  }
  return items.sort((a, b) => a.daysRemaining - b.daysRemaining);
}
