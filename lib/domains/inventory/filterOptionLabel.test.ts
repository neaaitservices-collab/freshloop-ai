import assert from 'node:assert/strict';
import test from 'node:test';
import { allFilterOptionLabel } from '@/lib/domains/inventory/filterOptionLabel';

test('filter all-option pluralizes category', () => {
  assert.equal(allFilterOptionLabel('Category'), 'All categories');
  assert.equal(allFilterOptionLabel('Department'), 'All departments');
  assert.equal(allFilterOptionLabel('Type'), 'All types');
  assert.equal(allFilterOptionLabel('Supplier'), 'All suppliers');
});
