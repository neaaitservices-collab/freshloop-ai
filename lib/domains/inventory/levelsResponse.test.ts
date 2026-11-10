import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IN_STOCK_LEVELS_PATH,
  interpretInventoryLevelsBody,
} from '@/lib/domains/inventory/levelsResponse';

test('in-stock levels path does not ask for POS sales', () => {
  assert.equal(IN_STOCK_LEVELS_PATH.includes('includePosSales'), false);
  assert.match(IN_STOCK_LEVELS_PATH, /inStockOnly=1/);
});

test('levels response accepts a stock array and surfaces API failures', () => {
  assert.deepEqual(interpretInventoryLevelsBody(true, { success: true, levels: [{ id: 'a' }] }), {
    levels: [{ id: 'a' }],
  });
  assert.deepEqual(interpretInventoryLevelsBody(false, { success: false, error: 'Forbidden' }), {
    error: 'Forbidden',
  });
  assert.deepEqual(interpretInventoryLevelsBody(true, { success: false }), {
    error: 'Live stock levels could not be loaded.',
  });
  assert.deepEqual(interpretInventoryLevelsBody(false, null), {
    error: 'Live stock levels could not be loaded.',
  });
});
