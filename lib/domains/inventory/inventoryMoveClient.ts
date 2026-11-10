import type { StockLevel } from '@/lib/domains/inventory/stock';
import {
  notifyInventoryUpdated,
  subscribeInventoryUpdated,
  type InventoryUpdatedDetail,
} from '@/lib/domains/inventory/inventoryEvents';
import { formatCurrency, formatUnits, stockUnitLabel } from '@/lib/domains/receiving/yieldPricing';
import { OFFLINE_MUTATION_KIND } from '@/lib/offline/types';
import { postJsonOrQueue } from '@/lib/offline/mutationClient';
import { createClientMutationId } from '@/lib/offline/queue';

export type { InventoryUpdatedDetail };
export { notifyInventoryUpdated, subscribeInventoryUpdated };

export type InventoryMoveAction = 'rescue' | 'waste' | 'markdown' | 'kitchen_waste' | 'sale';

export interface SubInventoryTransferRow {
  productId: string;
  name: string;
  unitType: string;
  onHand: number;
  kitchenPrepQty: number;
  isMarkdown?: boolean;
  markdownPct?: number | null;
  regularRetailPrice?: number | null;
  retailPrice?: number | null;
  unitCost?: number;
  posSoldInWindow?: number;
  posSalesDays?: number;
}

export interface InventoryMoveResult {
  success: boolean;
  action: InventoryMoveAction;
  level?: StockLevel;
  units?: number;
  error?: string;
}

export function stockLevelToTransferRow(level: StockLevel): SubInventoryTransferRow {
  return {
    productId: level.productId,
    name: level.name,
    unitType: level.unitType,
    onHand: level.onHand,
    kitchenPrepQty: level.kitchenPrepQty,
    isMarkdown: level.isMarkdown,
    markdownPct: level.markdownPct,
    regularRetailPrice: level.regularRetailPrice,
    retailPrice: level.retailPrice,
    unitCost: level.unitCost,
    posSoldInWindow: level.posSoldInWindow,
    posSalesDays: level.posSalesDays,
  };
}

const SALE_QTY_MAX = 1_000_000;

async function postFloorSale(input: {
  productId: string;
  quantity: number;
  clientMutationId: string;
  label?: string;
  broadcast?: boolean;
}): Promise<InventoryMoveResult & { queuedOffline?: boolean }> {
  const result = await postJsonOrQueue<{
    success?: boolean;
    error?: string;
    level?: StockLevel;
    units?: number;
    sale?: { quantitySold?: number };
  }>({
    kind: OFFLINE_MUTATION_KIND.INVENTORY_MOVE,
    url: '/api/sales',
    label: input.label ?? 'Record sale',
    body: {
      productId: input.productId,
      quantity: input.quantity,
      location: 'floor',
      clientMutationId: input.clientMutationId,
    },
  });
  if (result.ok && result.offline) {
    if (input.broadcast !== false) notifyInventoryUpdated({ productId: input.productId });
    return { success: true, action: 'sale', queuedOffline: true };
  }
  if (!result.ok) {
    return { success: false, action: 'sale', error: result.error };
  }
  const level = result.data.level;
  if (!result.data.success || !level) {
    return { success: false, action: 'sale', error: result.data.error ?? 'The sale could not be saved.' };
  }
  const units = result.data.units ?? result.data.sale?.quantitySold ?? input.quantity;
  if (input.broadcast !== false) {
    notifyInventoryUpdated({ level, productId: input.productId });
  }
  return { success: true, action: 'sale', level, units };
}

export async function executeInventoryMove(input: {
  productId: string;
  action: InventoryMoveAction;
  quantity?: number;
  staffId?: string;
  discountPct?: number;
  label?: string;
  /** Stable for this user action. Retries and the offline queue must send the same id. */
  clientMutationId?: string;
  /** When false, caller owns `freshloop-inventory-updated` (avoids double UI patches). */
  broadcast?: boolean;
}): Promise<InventoryMoveResult & { queuedOffline?: boolean }> {
  const clientMutationId = input.clientMutationId ?? createClientMutationId();
  if (input.action === 'sale') {
    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > SALE_QTY_MAX) {
      return {
        success: false,
        action: 'sale',
        error: 'Sale quantity must be greater than 0 and at most 1,000,000.',
      };
    }
    return postFloorSale({
      productId: input.productId,
      quantity,
      clientMutationId,
      label: input.label,
      broadcast: input.broadcast,
    });
  }
  const result = await postJsonOrQueue<InventoryMoveResult & { level?: StockLevel }>({
    kind: OFFLINE_MUTATION_KIND.INVENTORY_MOVE,
    url: '/api/inventory/move',
    label: input.label ?? `Transfer ${input.action}`,
    body: {
      productId: input.productId,
      action: input.action,
      quantity: input.quantity,
      discountPct: input.discountPct,
      clientMutationId,
    },
  });

  if (result.ok && result.offline) {
    if (input.broadcast !== false) {
      notifyInventoryUpdated({ productId: input.productId });
      if (input.action === 'rescue' && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('freshloop-kitchen-inbox', {
            detail: { productId: input.productId, units: input.quantity },
          })
        );
      }
    }
    return {
      success: true,
      action: input.action,
      queuedOffline: true,
    };
  }

  if (!result.ok) {
    return {
      success: false,
      action: input.action,
      error: result.error,
    };
  }

  const json = result.data;
  if (!json.success || !json.level) {
    return {
      success: false,
      action: input.action,
      error: json.error ?? 'The transfer could not be saved.',
    };
  }
  if (input.broadcast !== false) {
    notifyInventoryUpdated({ level: json.level, productId: input.productId });
    if (input.action === 'rescue' && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('freshloop-kitchen-inbox', {
          detail: { productId: input.productId, units: json.units },
        })
      );
    }
  }
  return {
    success: true,
    action: input.action,
    level: json.level,
    units: json.units,
  };
}

export function transferSuccessMessage(
  action: InventoryMoveAction,
  row: SubInventoryTransferRow,
  level: StockLevel,
  units?: number
): string {
  const unitLabel = stockUnitLabel(row.unitType);
  const moved = Number.isFinite(units) && units! > 0 ? units! : row.onHand;

  if (action === 'markdown') {
    const pct = level.markdownPct ?? (level.regularRetailPrice && level.retailPrice
      ? Math.round(((level.regularRetailPrice - level.retailPrice) / level.regularRetailPrice) * 100)
      : 30);
    return `${row.name}: ${formatCurrency(level.regularRetailPrice ?? level.retailPrice ?? 0)} → ${formatCurrency(level.retailPrice ?? 0)} (${pct}% off)`;
  }
  if (action === 'kitchen_waste') {
    return `${row.name}: ${formatUnits(moved)} ${unitLabel} discarded from production prep.`;
  }
  if (action === 'waste') {
    return `${row.name}: ${formatUnits(moved)} ${unitLabel} discarded from the floor.`;
  }
  if (action === 'sale') {
    return `${row.name}: sold ${formatUnits(moved)} ${unitLabel} · floor now ${formatUnits(level.onHand)} ${unitLabel}.`;
  }
  return `${row.name}: ${formatUnits(moved)} ${unitLabel} sent to production · floor now ${formatUnits(level.onHand)} ${unitLabel}.`;
}
