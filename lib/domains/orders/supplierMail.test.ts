import assert from 'node:assert/strict';
import test from 'node:test';
import {
  draftForAll,
  draftForRows,
  storedSupplierRecipient,
} from '@/components/features/orders/supplierMail';
import type { StockLevel } from '@/lib/domains/inventory/stock';

function row(supplier: string): StockLevel {
  return {
    productId: `${supplier}-apple`,
    name: 'Apples',
    supplier,
    orderCases: 2,
    low: true,
  } as StockLevel;
}

test('purchase-order drafts use a stored recipient and never invent one', () => {
  assert.equal(storedSupplierRecipient('  buyer@farm.test '), 'buyer@farm.test');
  assert.equal(storedSupplierRecipient(null), '');
  assert.equal(storedSupplierRecipient(undefined), '');

  const blank = draftForRows('Farm & Sons', [row('Farm & Sons')], null);
  assert.equal(blank.to, '');
  assert.doesNotMatch(`${blank.to} ${blank.subject}`, /orders@/);

  const stored = draftForRows('Farm & Sons', [row('Farm & Sons')], 'buyer@farm.test');
  assert.equal(stored.to, 'buyer@farm.test');

  const all = draftForAll([
    { supplier: 'Farm & Sons', rows: [row('Farm & Sons')], email: '  ' },
    { supplier: 'Dairy Co', rows: [row('Dairy Co')], email: 'desk@dairy.test' },
  ]);
  assert.equal(all.to, 'desk@dairy.test');
  assert.doesNotMatch(all.to, /orders@/);
});
