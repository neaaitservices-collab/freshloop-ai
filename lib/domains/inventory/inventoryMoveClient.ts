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
  };
}

export function notifyInventoryUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('freshloop-inventory-updated'));
  }
}

export async function executeInventoryMove(input: {
  productId: string;
  action: InventoryMoveAction;
  quantity?: number;
  staffId?: string;
  discountPct?: number;
}): Promise<InventoryMoveResult> {
  try {
    const response = await fetch('/api/inventory/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: input.productId,
        action: input.action,
        quantity: input.quantity,
        staffId: input.staffId ?? '',
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
    notifyInventoryUpdated();
    if (input.action === 'rescue' && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('freshloop-kitchen-inbox', {
          detail: { productId: input.productId, units: json.units },
        })
      );
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
    return `${row.name}: ${formatUnits(moved)} ${unitLabel} discarded from kitchen prep.`;
  }
  if (action === 'waste') {
    return `${row.name}: ${formatUnits(moved)} ${unitLabel} discarded from the floor.`;
  }
  if (action === 'sale') {
    return `${row.name}: sold ${formatUnits(moved)} ${unitLabel} · floor now ${formatUnits(level.onHand)} ${unitLabel}.`;
  }
  return `${row.name}: ${formatUnits(moved)} ${unitLabel} sent to kitchen · floor now ${formatUnits(level.onHand)} ${unitLabel}.`;
}
