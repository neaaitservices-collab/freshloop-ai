import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paginateStockLevels, parseLevelsPagination } from '@/lib/domains/inventory/levelsList';
import type { StockLevel } from '@/lib/domains/inventory/stock';

const stub = (id: string): StockLevel =>
  ({ productId: id, name: id } as StockLevel);

test('parseLevelsPagination defaults to full list', () => {
  assert.deepEqual(parseLevelsPagination(null, null), { offset: 0 });
});

test('paginateStockLevels slices with limit and offset', () => {
  const levels = [stub('a'), stub('b'), stub('c'), stub('d')];
  const page = paginateStockLevels(levels, 2, 1);
  assert.equal(page.total, 4);
  assert.equal(page.page.length, 2);
  assert.equal(page.page[0]?.productId, 'b');
});
