import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paginateStockLevels, parseLevelsPagination } from '@/lib/domains/inventory/levelsList';
import type { StockLevel } from '@/lib/domains/inventory/stock';

const stub = (id: string): StockLevel =>
  ({ productId: id, name: id } as StockLevel);

test('parseLevelsPagination defaults to full list', () => {
  assert.deepEqual(parseLevelsPagination(null, null), { offset: 0 });
});

test('parseLevelsPagination preserves offset when limit omitted', () => {
  assert.deepEqual(parseLevelsPagination(null, '12'), { offset: 12 });
});

test('paginateStockLevels applies offset without explicit limit', () => {
  const levels = [stub('a'), stub('b'), stub('c')];
  const page = paginateStockLevels(levels, undefined, 1);
  assert.equal(page.total, 3);
  assert.equal(page.page.length, 2);
  assert.equal(page.offset, 1);
  assert.equal(page.page[0]?.productId, 'b');
});

test('paginateStockLevels slices with limit and offset', () => {
  const levels = [stub('a'), stub('b'), stub('c'), stub('d')];
  const page = paginateStockLevels(levels, 2, 1);
  assert.equal(page.total, 4);
  assert.equal(page.page.length, 2);
  assert.equal(page.page[0]?.productId, 'b');
});

test('parseLevelsPagination clamps bad offset to zero', () => {
  assert.deepEqual(parseLevelsPagination('10', 'not-a-number'), { limit: 10, offset: 0 });
});

test('parseLevelsPagination rejects non-positive limit', () => {
  assert.deepEqual(parseLevelsPagination('0', '5'), { offset: 5 });
  assert.deepEqual(parseLevelsPagination('-3', '2'), { offset: 2 });
});

test('paginateStockLevels empty catalog and offset past end', () => {
  const empty = paginateStockLevels([], 10, 0);
  assert.equal(empty.page.length, 0);
  assert.equal(empty.offset, 0);
  const levels = [stub('only')];
  const past = paginateStockLevels(levels, 5, 99);
  assert.equal(past.page.length, 0);
  assert.equal(past.offset, 1);
});
