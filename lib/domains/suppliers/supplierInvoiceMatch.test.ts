import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADD_OCR_SUPPLIER_VALUE,
  addOcrSupplierLabel,
  matchSupplierByName,
  supplierInvoiceSavePlan,
} from '@/lib/domains/suppliers/supplierInvoiceMatch';

const SPRUCEWOOD = { id: 'sup_spruce', name: 'Sprucewood Handmade Cookie' };
const ACME = { id: 'sup_acme', name: 'Acme Foods LLC' };
const COSTCO = { id: 'sup_costco', name: 'Costco' };

test('printed supplier names match ignoring case, punctuation, and legal suffixes', () => {
  const suppliers = [ACME, SPRUCEWOOD, COSTCO];
  for (const printed of [
    'Sprucewood Handmade Cookie Co.',
    'sprucewood handmade cookie co.',
    'SPRUCEWOOD HANDMADE COOKIE, INC.',
    'Sprucewood-Handmade Cookie Corp',
    'Sprucewood Handmade Cookie L.L.C.',
    'Sprucewood Handmade Cookie, Ltd.',
  ]) {
    const match = matchSupplierByName(printed, suppliers);
    assert.equal(match.status, 'matched', printed);
    if (match.status === 'matched') assert.equal(match.supplier.id, 'sup_spruce');
  }

  const exactSuffix = matchSupplierByName('Acme Foods LLC', [
    { id: 'sup_acme_inc', name: 'Acme Foods Inc' },
    ACME,
  ]);
  assert.equal(exactSuffix.status, 'matched');
  if (exactSuffix.status === 'matched') assert.equal(exactSuffix.supplier.id, 'sup_acme');

  assert.equal(matchSupplierByName('Costco', suppliers).status, 'matched');
  assert.notEqual(matchSupplierByName('Cost', suppliers).status, 'matched');
  const linked = supplierInvoiceSavePlan({
    ocrName: 'Sprucewood Handmade Cookie Co.',
    selectedSupplierId: 'sup_spruce',
  });
  assert.deepEqual(linked, { action: 'link', supplierId: 'sup_spruce' });
});

test('an unmatched or ambiguous printed name stays unmatched', () => {
  const suppliers = [SPRUCEWOOD, ACME];
  const none = matchSupplierByName('Northwind Baking', suppliers);
  assert.equal(none.status, 'none');
  assert.equal(addOcrSupplierLabel('Northwind Baking'), 'Add "Northwind Baking" as new supplier');
  assert.equal(addOcrSupplierLabel('  Northwind   Baking  '), 'Add "Northwind Baking" as new supplier');

  const ambiguous = matchSupplierByName('Acme Foods', [
    { id: 'sup_inc', name: 'Acme Foods Inc' },
    { id: 'sup_llc', name: 'Acme Foods LLC' },
  ]);
  assert.equal(ambiguous.status, 'none');

  const blocked = supplierInvoiceSavePlan({
    ocrName: 'Northwind Baking',
    selectedSupplierId: '',
  });
  assert.deepEqual(blocked, { action: 'blocked' });
});

test('add-new creates only the printed name, and only when that option is chosen', () => {
  const plan = supplierInvoiceSavePlan({
    ocrName: '  Northwind Baking Co. ',
    selectedSupplierId: ADD_OCR_SUPPLIER_VALUE,
  });
  assert.deepEqual(plan, { action: 'create', name: 'Northwind Baking Co.' });

  assert.deepEqual(
    supplierInvoiceSavePlan({
      ocrName: 'Sprucewood Handmade Cookie Co.',
      selectedSupplierId: 'sup_spruce',
    }),
    { action: 'link', supplierId: 'sup_spruce' }
  );
  assert.deepEqual(
    supplierInvoiceSavePlan({ ocrName: '   ', selectedSupplierId: ADD_OCR_SUPPLIER_VALUE }),
    { action: 'blocked' }
  );
});
