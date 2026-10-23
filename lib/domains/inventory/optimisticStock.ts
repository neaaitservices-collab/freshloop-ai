import type { InventoryMoveAction } from '@/lib/domains/inventory/inventoryMoveClient';
import type { StockLevel } from '@/lib/domains/inventory/stock';

function roundQty(value: number): number {
  return Number(value.toFixed(2));
}

/** Client-side preview of ledger moves before the API responds. */
export function applyOptimisticMove(
  row: StockLevel,
  action: InventoryMoveAction,
  quantity: number
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

  if (action === 'markdown') {
    const regular = row.regularRetailPrice ?? row.retailPrice ?? row.unitCost;
    const markdownPrice =
      regular !== null && regular > 0 ? Number((regular * 0.7).toFixed(2)) : row.retailPrice;
    return {
      ...row,
      isMarkdown: true,
      regularRetailPrice: row.regularRetailPrice ?? row.retailPrice ?? regular,
      retailPrice: markdownPrice,
    };
  }

  return row;
}
