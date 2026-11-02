import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOptimisticMove } from '@/lib/domains/inventory/optimisticStock';
import type { StockLevel } from '@/lib/domains/inventory/stock';

function level(partial: Partial<StockLevel> & Pick<StockLevel, 'productId'>): StockLevel {
  const { productId, ...rest } = partial;
  return {
    productId,
    name: 'Bananas',
    supplier: 'Farm',
    department: 'PRODUCE',
    category: 'PRODUCE',
    productType: 'RETAIL',
    origin: null,
    unitType: 'EACH',
    casePackSize: 12,
    unitCost: 1,
    onHand: partial.onHand ?? 10,
    kitchenPrepQty: partial.kitchenPrepQty ?? 0,
    parUnits: 0,
    onHandCases: partial.onHandCases ?? 10 / 12,
    parCases: 0,
    orderCases: 0,
    orderCost: 0,
    low: false,
    retailPrice: 3,
    regularRetailPrice: 3,
    isMarkdown: false,
    daysRemaining: 2,
    ...rest,
  };
}

test('applyOptimisticMove rescue moves qty floor to kitchen', () => {
  const row = level({ productId: 'x', onHand: 10, kitchenPrepQty: 0 });
  const next = applyOptimisticMove(row, 'rescue', 4);
  assert.equal(next.onHand, 6);
  assert.equal(next.kitchenPrepQty, 4);
});

test('applyOptimisticMove sale caps at on-hand', () => {
  const row = level({ productId: 'x', onHand: 3 });
  const next = applyOptimisticMove(row, 'sale', 99);
  assert.equal(next.onHand, 0);
});

test('applyOptimisticMove waste never goes negative on floor', () => {
  const row = level({ productId: 'x', onHand: 2 });
  const next = applyOptimisticMove(row, 'waste', 5);
  assert.equal(next.onHand, 0);
});
