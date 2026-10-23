import { isManager, type RoleName } from '@/lib/roles';
import type { StockLevel } from '@/lib/stock';

/** Ledger locations exposed in the UI (maps to `InventoryLocation` in Prisma). */
export type SubInventoryTab = 'retail_floor' | 'kitchen_prep';

export const SUB_INVENTORY_TAB_LABELS: Record<SubInventoryTab, string> = {
  retail_floor: 'Retail floor',
  kitchen_prep: 'Kitchen prep',
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

export function filterRetailFloorLevels(levels: StockLevel[]): StockLevel[] {
  return levels.filter((row) => row.onHand > 0);
}

export function filterKitchenPrepLevels(levels: StockLevel[]): StockLevel[] {
  return levels.filter((row) => row.kitchenPrepQty > 0);
}

export function retailFloorBalance(levels: StockLevel[]): number {
  return levels.reduce((sum, row) => sum + row.onHand, 0);
}

export function kitchenPrepBalance(levels: StockLevel[]): number {
  return levels.reduce((sum, row) => sum + row.kitchenPrepQty, 0);
}
