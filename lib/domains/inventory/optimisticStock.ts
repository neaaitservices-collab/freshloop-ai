import type { InventoryMoveAction } from '@/lib/domains/inventory/inventoryMoveClient';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { stockFromPar } from '@/lib/domains/inventory/parLevel';

function roundQty(value: number): number {
  return Number(value.toFixed(2));
}

/** Client-side preview of ledger moves before the API responds. */
export function applyOptimisticMove(
  row: StockLevel,
  action: InventoryMoveAction,
  quantity: number,
  discountPct?: number
): StockLevel {
  const qty = Math.max(0, quantity);

  if (action === 'rescue') {
    const moved = Math.min(qty, row.onHand);
    return {
      ...row,
      onHand: roundQty(row.onHand - moved),
      kitchenPrepQty: roundQty(row.kitchenPrepQty + moved),
      onHandCases: roundQty(Math.max(0, row.onHandCases - moved / Math.max(row.casePackSize, 1))),
    };
  }

  if (action === 'waste') {
    const moved = Math.min(qty, row.onHand);
    return {
      ...row,
      onHand: roundQty(row.onHand - moved),
      onHandCases: roundQty(Math.max(0, row.onHandCases - moved / Math.max(row.casePackSize, 1))),
    };
  }

  if (action === 'kitchen_waste') {
    const moved = Math.min(qty, row.kitchenPrepQty);
    return {
      ...row,
      kitchenPrepQty: roundQty(row.kitchenPrepQty - moved),
    };
  }

  if (action === 'sale') {
    const sold = Math.min(qty, row.onHand);
    return {
      ...row,
      onHand: roundQty(row.onHand - sold),
      onHandCases: roundQty(Math.max(0, row.onHandCases - sold / Math.max(row.casePackSize, 1))),
    };
  }

  if (action === 'markdown') {
    const pct = discountPct ?? 30;
    const regular = row.regularRetailPrice ?? row.retailPrice ?? row.unitCost;
    const multiplier = (100 - pct) / 100;
    const markdownPrice =
      regular !== null && regular > 0 ? Number((regular * multiplier).toFixed(2)) : row.retailPrice;
    return {
      ...row,
      isMarkdown: true,
      markdownPct: pct,
      regularRetailPrice: row.regularRetailPrice ?? row.retailPrice ?? regular,
      retailPrice: markdownPrice,
    };
  }

  return row;
}

/** Preview shelf stock after a manager sets cases on hand (floor + deli target). */
export function applyOptimisticStockCases(row: StockLevel, casesOnHand: number): StockLevel {
  const pack = row.casePackSize > 0 ? row.casePackSize : 1;
  const onHand = Number((Math.max(0, casesOnHand) * pack).toFixed(2));
  const rated = stockFromPar({
    onHand,
    casePackSize: pack,
    unitCost: row.unitCost,
    parCases: row.parCases,
  });
  return { ...row, onHand, ...rated };
}
