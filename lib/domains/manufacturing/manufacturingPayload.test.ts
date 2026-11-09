import assert from 'node:assert/strict';
import test from 'node:test';
import { manufacturingPayloadHash } from '@/lib/domains/manufacturing/executeBatch';
import { manufacturingPayloadKey } from '@/lib/domains/manufacturing/manufacturingPayload';

const base = {
  recipe_id: ' recipe-1 ',
  batch_output: 4,
  enforce_stock_check: true,
};

test('manufacturing payload key trims recipe id and treats omitted overrides as empty', () => {
  const withEmpty = manufacturingPayloadKey({ ...base, ingredient_overrides: [] });
  const omitted = manufacturingPayloadKey(base);
  assert.equal(withEmpty, omitted);
  assert.match(withEmpty, /"recipe_id":"recipe-1"/);
});

test('manufacturing payload hash changes when the batch or override order changes', () => {
  const first = manufacturingPayloadHash({
    ...base,
    ingredient_overrides: [
      { ingredient_product_id: 'a', actual_qty_used: 1 },
      { ingredient_product_id: 'b', actual_qty_used: 2 },
    ],
  });
  const reordered = manufacturingPayloadHash({
    ...base,
    ingredient_overrides: [
      { ingredient_product_id: 'b', actual_qty_used: 2 },
      { ingredient_product_id: 'a', actual_qty_used: 1 },
    ],
  });
  const largerBatch = manufacturingPayloadHash({ ...base, batch_output: 5 });
  assert.notEqual(first, reordered);
  assert.notEqual(first, largerBatch);
  assert.equal(first, manufacturingPayloadHash({
    ...base,
    ingredient_overrides: [
      { ingredient_product_id: 'a', actual_qty_used: 1 },
      { ingredient_product_id: 'b', actual_qty_used: 2 },
    ],
  }));
});
