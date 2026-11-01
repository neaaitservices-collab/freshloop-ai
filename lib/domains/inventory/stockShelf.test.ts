import assert from 'node:assert/strict';
import test from 'node:test';
import { planShelfAdjustment } from '@/lib/domains/inventory/stock';

test('case overrides add units on the retail floor', () => {
  assert.deepEqual(
    planShelfAdjustment({ targetUnits: 20, floorOnHand: 10, deliOnHand: 4 }),
    { floorDelta: 6, deliDelta: 0 }
  );
});

test('case overrides shrink the floor before deli and leave kitchen out of the math', () => {
  assert.deepEqual(
    planShelfAdjustment({ targetUnits: 6, floorOnHand: 10, deliOnHand: 4 }),
    { floorDelta: -8, deliDelta: 0 }
  );
  assert.deepEqual(
    planShelfAdjustment({ targetUnits: 2, floorOnHand: 10, deliOnHand: 4 }),
    { floorDelta: -10, deliDelta: -2 }
  );
});

test('a case override that already matches shelf stock is a no-op', () => {
  assert.deepEqual(
    planShelfAdjustment({ targetUnits: 8, floorOnHand: 5, deliOnHand: 3 }),
    { floorDelta: 0, deliDelta: 0 }
  );
});
