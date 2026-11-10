import assert from 'node:assert/strict';
import test from 'node:test';
import {
  belowParSkus,
  forecastSuggestedSkus,
  outOfStockSkus,
  stockAlertCounts,
} from '@/lib/domains/inventory/lowStock';
import { DEFAULT_PAR_CASES, resolveParCases, stockFromPar } from '@/lib/domains/inventory/parLevel';

function rated(onHand: number, parCases: number | null, forecastDriven = false) {
  const par = resolveParCases(parCases, DEFAULT_PAR_CASES);
  const stock = stockFromPar({
    onHand,
    casePackSize: 1,
    unitCost: 1,
    parCases: par,
  });
  return {
    onHand: Number(onHand.toFixed(2)),
    parUnits: stock.parUnits,
    forecastDriven,
  };
}

test('below par, at par, and an empty shelf stay in separate buckets', () => {
  const below = rated(1, 2);
  const atPar = rated(2, 2);
  const empty = rated(0, 2);
  const levels = [below, atPar, empty];

  assert.equal(belowParSkus(levels).length, 1);
  assert.equal(belowParSkus(levels)[0], below);
  assert.equal(outOfStockSkus(levels).length, 1);
  assert.equal(outOfStockSkus(levels)[0], empty);
  assert.deepEqual(stockAlertCounts(levels), {
    belowPar: 1,
    outOfStock: 1,
    forecastSuggested: 0,
  });
});

test('null and zero par use the store default before the below-par check', () => {
  assert.equal(resolveParCases(null, DEFAULT_PAR_CASES), DEFAULT_PAR_CASES);
  assert.equal(resolveParCases(0, DEFAULT_PAR_CASES), DEFAULT_PAR_CASES);
  const unset = rated(1, null);
  const zeroPar = rated(1, 0);
  assert.equal(unset.parUnits, DEFAULT_PAR_CASES);
  assert.equal(belowParSkus([unset, zeroPar]).length, 2);
  assert.equal(outOfStockSkus([unset, zeroPar]).length, 0);
});

test('admin below-par count matches the orders below-par count for the same levels', () => {
  const levels = [
    rated(1, 4),
    rated(4, 4),
    rated(0, 4),
    rated(8, 2, true),
    rated(1, 3, true),
  ];
  const adminLowCount = belowParSkus(levels).length;
  const orders = stockAlertCounts(levels);
  assert.equal(adminLowCount, orders.belowPar);
  assert.equal(orders.belowPar, 2);
  assert.equal(orders.outOfStock, 1);
  assert.equal(orders.forecastSuggested, 1);
  assert.equal(forecastSuggestedSkus(levels).length, 1);
  const tagged = belowParSkus(levels).length + outOfStockSkus(levels).length + forecastSuggestedSkus(levels).length;
  assert.equal(tagged, 4);
  assert.equal(levels.length - tagged, 1);
});
