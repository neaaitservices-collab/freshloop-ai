import { isManager, type RoleName } from '@/lib/utils/roles';
import type { StockLevel } from '@/lib/domains/inventory/stock';

/** Ledger locations exposed in the UI (maps to `InventoryLocation` in Prisma). */
export type SubInventoryTab = 'retail_floor' | 'kitchen_prep';

export const SUB_INVENTORY_TAB_LABELS: Record<SubInventoryTab, string> = {
  retail_floor: 'Retail floor',
  kitchen_prep: 'Production prep',
};

/** Which sub-inventory tabs a role may see. Clerks get retail only; kitchen gets both. */
export function subInventoryTabsForRole(role: RoleName | undefined): SubInventoryTab[] {
  if (!role || isManager(role)) return ['retail_floor', 'kitchen_prep'];
  if (role === 'DELI_CHEF') return ['kitchen_prep', 'retail_floor'];
  if (role === 'FLOOR_STAFF' || role === 'RECEIVING_CLERK') return ['retail_floor'];
  return ['retail_floor', 'kitchen_prep'];
}

export function defaultSubInventoryTab(role: RoleName | undefined): SubInventoryTab {
  if (role === 'DELI_CHEF') return 'kitchen_prep';
  return 'retail_floor';
}

/** Ignore float dust from ledger aggregations when hiding empty rows. */
export const SUB_INVENTORY_STOCK_EPS = 0.000_1;

export function hasRetailFloorStock(row: Pick<StockLevel, 'onHand'>): boolean {
  return row.onHand > SUB_INVENTORY_STOCK_EPS;
}

export function hasKitchenPrepStock(row: Pick<StockLevel, 'kitchenPrepQty'>): boolean {
  return row.kitchenPrepQty > SUB_INVENTORY_STOCK_EPS;
}

export function hasAnySubInventoryStock(row: StockLevel): boolean {
  return hasRetailFloorStock(row) || hasKitchenPrepStock(row);
}

export function filterRetailFloorLevels(levels: StockLevel[]): StockLevel[] {
  return levels.filter(hasRetailFloorStock);
}

export function filterKitchenPrepLevels(levels: StockLevel[]): StockLevel[] {
  return levels.filter(hasKitchenPrepStock);
}

export function filterLevelsWithAnyStock(levels: StockLevel[]): StockLevel[] {
  return levels.filter(hasAnySubInventoryStock);
}

function withPreservedPosStats(existing: StockLevel | undefined, level: StockLevel): StockLevel {
  if (!existing || level.posSalesDays != null) return level;
  return {
    ...level,
    posSoldInWindow: existing.posSoldInWindow,
    posSalesDays: existing.posSalesDays,
  };
}

/** Apply a single SKU snapshot from move/sale APIs without reloading the full catalog. */
export function applyStockLevelPatch(current: StockLevel[], level: StockLevel): StockLevel[] {
  const existing = current.find((row) => row.productId === level.productId);
  const merged = withPreservedPosStats(existing, level);
  const rest = current.filter((row) => row.productId !== level.productId);
  if (!hasAnySubInventoryStock(merged)) return rest;
  return filterLevelsWithAnyStock([...rest, merged]);
}

export function retailFloorBalance(levels: StockLevel[]): number {
  return levels.reduce((sum, row) => sum + row.onHand, 0);
}

export function kitchenPrepBalance(levels: StockLevel[]): number {
  return levels.reduce((sum, row) => sum + row.kitchenPrepQty, 0);
}
