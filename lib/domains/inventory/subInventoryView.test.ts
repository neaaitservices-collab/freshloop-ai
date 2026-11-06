import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyStockLevelPatch,
  filterLevelsWithAnyStock,
  hasAnySubInventoryStock,
} from '@/lib/domains/inventory/subInventoryView';
import type { StockLevel } from '@/lib/domains/inventory/stock';

function level(partial: Partial<StockLevel> & Pick<StockLevel, 'productId'>): StockLevel {
  const { productId, ...rest } = partial;
  return {
    productId,
    name: partial.name ?? 'Test SKU',
    supplier: 'Vendor',
    department: 'PRODUCE',
    category: 'PRODUCE',
    productType: 'RETAIL',
    origin: null,
    unitType: 'EACH',
    casePackSize: 12,
    receivePackSize: 12,
    splitFactor: 1,
    unitCost: 1,
    onHand: partial.onHand ?? 0,
    kitchenPrepQty: partial.kitchenPrepQty ?? 0,
    parUnits: 0,
    onHandCases: partial.onHandCases ?? 0,
    parCases: 0,
    orderCases: 0,
    orderCost: 0,
    low: false,
    receiveCaseCost: null,
    pullSensitivityDays: null,
    pullDays: 3,
    caseRetailPrice: null,
    retailPrice: 3,
    regularRetailPrice: 3,
    isMarkdown: false,
    daysRemaining: 5,
    ...rest,
  };
}

test('applyStockLevelPatch replaces an existing row', () => {
  const a = level({ productId: 'a', onHand: 5 });
  const b = level({ productId: 'b', onHand: 2 });
  const updated = level({ productId: 'a', onHand: 3, kitchenPrepQty: 1 });
  const next = applyStockLevelPatch([a, b], updated);
  assert.equal(next.length, 2);
  assert.equal(next.find((r) => r.productId === 'a')?.onHand, 3);
  assert.equal(next.find((r) => r.productId === 'b')?.onHand, 2);
});

test('applyStockLevelPatch drops SKU when floor and kitchen are both zero', () => {
  const a = level({ productId: 'a', onHand: 1 });
  const emptied = level({ productId: 'a', onHand: 0, kitchenPrepQty: 0 });
  const next = applyStockLevelPatch([a], emptied);
  assert.deepEqual(next, []);
});

test('applyStockLevelPatch keeps POS sales stats when move API omits them', () => {
  const a = level({
    productId: 'a',
    onHand: 5,
    posSalesDays: 3,
    posSoldInWindow: 7,
  });
  const fromMove = level({ productId: 'a', onHand: 3 });
  const next = applyStockLevelPatch([a], fromMove);
  assert.equal(next[0]?.posSoldInWindow, 7);
  assert.equal(next[0]?.posSalesDays, 3);
});

test('applyStockLevelPatch keeps SKU when only kitchen has stock', () => {
  const a = level({ productId: 'a', onHand: 2 });
  const moved = level({ productId: 'a', onHand: 0, kitchenPrepQty: 2 });
  const next = applyStockLevelPatch([a], moved);
  assert.equal(next.length, 1);
  assert.equal(next[0]?.kitchenPrepQty, 2);
});

test('filterLevelsWithAnyStock ignores dust at or below epsilon', () => {
  const rows = [
    level({ productId: 'dust', onHand: 0.00001 }),
    level({ productId: 'ok', onHand: 0.001 }),
  ];
  const filtered = filterLevelsWithAnyStock(rows);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.productId, 'ok');
  assert.equal(hasAnySubInventoryStock(rows[0]!), false);
});
