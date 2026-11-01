import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveInvoiceReceipt } from '@/lib/domains/receiving/invoiceOcrCommit';

test('case receipts convert pack quantity and divide case cost into a unit cost', () => {
  const resolved = resolveInvoiceReceipt(
    {
      product_id: 'sku',
      quantity: 2,
      quantity_kind: 'cases',
      unit_cost: 24,
      case_pack_size: 12,
    },
    6
  );
  assert.equal(resolved.units, 24);
  assert.equal(resolved.unitCost, 2);
});

test('unit receipts keep the quoted unit cost', () => {
  const resolved = resolveInvoiceReceipt(
    { product_id: 'sku', quantity: 3, unit_cost: 1.25 },
    12
  );
  assert.equal(resolved.units, 3);
  assert.equal(resolved.unitCost, 1.25);
});

test('a zero quantity does not invent units', () => {
  const resolved = resolveInvoiceReceipt(
    { product_id: 'sku', quantity: 0, quantity_kind: 'cases', unit_cost: 10 },
    8
  );
  assert.deepEqual(resolved, { units: 0, unitCost: 0 });
});
