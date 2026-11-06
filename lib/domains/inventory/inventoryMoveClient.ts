import type { StockLevel } from '@/lib/domains/inventory/stock';
import { formatCurrency, formatUnits, stockUnitLabel } from '@/lib/domains/receiving/yieldPricing';

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

export type InventoryUpdatedDetail = {
  level?: StockLevel;
  productId?: string;
  /** List already patched this level (skip duplicate merges in listeners). */
  source?: 'level-patch';
  /** Waste KPI state already returned from volumetric-scrap POST. */
  skipWasteKpiRefresh?: boolean;
  /** Skip debounced `/api/admin/stats` refresh (e.g. single-SKU case override). */
  skipStatsRefresh?: boolean;
};

const INVENTORY_UPDATED_CHANNEL = 'freshloop-inventory-updated';

export function notifyInventoryUpdated(detail?: InventoryUpdatedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('freshloop-inventory-updated', { detail }));
  try {
    const channel = new BroadcastChannel(INVENTORY_UPDATED_CHANNEL);
    channel.postMessage({ type: 'inventory-updated' });
    channel.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
}

/** Same-tab + other browser tabs (Admin while logging on Production). */
export function subscribeInventoryUpdated(
  handler: (detail?: InventoryUpdatedDetail) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const onWindow = (event: Event) => {
    const detail = (event as CustomEvent<InventoryUpdatedDetail>).detail;
    handler(detail);
  };
  window.addEventListener('freshloop-inventory-updated', onWindow);

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(INVENTORY_UPDATED_CHANNEL);
    channel.onmessage = () => handler();
  } catch {
    /* ignore */
  }

  return () => {
    window.removeEventListener('freshloop-inventory-updated', onWindow);
    channel?.close();
  };
}

export async function executeInventoryMove(input: {
  productId: string;
  action: InventoryMoveAction;
  quantity?: number;
  staffId?: string;
  discountPct?: number;
  /** When false, caller owns `freshloop-inventory-updated` (avoids double UI patches). */
  broadcast?: boolean;
}): Promise<InventoryMoveResult> {
  try {
    const response = await fetch('/api/inventory/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: input.productId,
        action: input.action,
        quantity: input.quantity,
        discountPct: input.discountPct,
      }),
    });
    const json = (await response.json()) as InventoryMoveResult & { level?: StockLevel };
    if (!response.ok || !json.success || !json.level) {
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
  } catch {
    return {
      success: false,
      action: input.action,
      error: 'The transfer could not reach the server.',
    };
  }
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
