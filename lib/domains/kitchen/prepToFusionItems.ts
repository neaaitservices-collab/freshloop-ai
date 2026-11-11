import type { InventoryItem } from '@/types';
import { getStockLevels, type StockLevel } from '@/lib/domains/inventory/stock';
import { filterKitchenPrepLevels } from '@/lib/domains/inventory/subInventoryView';
import { prisma } from '@/lib/domains/inventory/ledger';
import type { Department } from '@prisma/client';

function departmentFromPrisma(value: Department): InventoryItem['department'] {
  const map: Record<Department, InventoryItem['department']> = {
    PRODUCE: 'PRODUCE',
    DAIRY: 'DAIRY',
    BAKERY: 'BAKERY',
    PANTRY: 'PANTRY',
    DELI_KITCHEN: 'PANTRY',
    GROCERY: 'GROCERY',
  };
  return map[value] ?? 'PRODUCE';
}

export function stockLevelToFusionItem(
  level: StockLevel,
  department: InventoryItem['department'] = 'PRODUCE'
): InventoryItem {
  const today = new Date().toISOString().split('T')[0];
  return {
    id: level.productId,
    name: level.name,
    department,
    quantity: level.kitchenPrepQty,
    unit: level.unitType,
    casePackSize: level.casePackSize || 1,
    subUnit: level.unitType,
    receivedCost: level.unitCost,
    receivedDate: today,
    expirationDate: today,
    daysRemaining: level.daysRemaining,
    condition: level.daysRemaining <= 2 ? 'Overripe' : 'Near Expiry',
    status: level.daysRemaining <= 4 ? 'PULL_RESCUE' : 'WARNING',
    pullThresholdDays: 3,
    location: 'Kitchen_Prep',
    supplier: level.supplier,
  };
}

/** Ledger `Kitchen_Prep` balances mapped for Recipe Fusion prompts. */
export async function getKitchenPrepFusionItems(productIds?: string[]): Promise<InventoryItem[]> {
  const levels = filterKitchenPrepLevels(await getStockLevels());
  const picked =
    productIds && productIds.length > 0
      ? levels.filter((row) => productIds.includes(row.productId))
      : levels;

  if (picked.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: picked.map((p) => p.productId) } },
    select: { id: true, department: true },
  });
  const deptById = new Map(products.map((p) => [p.id, departmentFromPrisma(p.department)]));

  return picked.map((level) =>
    stockLevelToFusionItem(level, deptById.get(level.productId) ?? 'PRODUCE')
  );
}
