import assert from 'node:assert/strict';
import test from 'node:test';
import { IN_STOCK_LEVELS_PATH } from '@/lib/domains/inventory/levelsResponse';

test('live prep on-hand does not take a production date filter', () => {
  assert.equal(IN_STOCK_LEVELS_PATH.includes('preset'), false);
  assert.equal(IN_STOCK_LEVELS_PATH.includes('from='), false);
  assert.equal(IN_STOCK_LEVELS_PATH.includes('to='), false);
});
