import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalInvoiceDate,
  canonicalInvoiceNumber,
  normalizeInvoiceNumber,
} from '@/lib/domains/receiving/invoiceDeliveryId';

test('a page suffix is removed only when it is 01-09 or the known page', () => {
  assert.equal(normalizeInvoiceNumber('900375 01'), '900375');
  assert.equal(normalizeInvoiceNumber('900375 02'), '900375');
  assert.equal(normalizeInvoiceNumber('900375-01'), '900375');
  assert.equal(normalizeInvoiceNumber('900375-02'), '900375');
  assert.equal(normalizeInvoiceNumber('900375 - 02'), '900375');
  assert.equal(normalizeInvoiceNumber('  900375   01  '), '900375');
  assert.equal(normalizeInvoiceNumber('900375 09'), '900375');
  assert.equal(normalizeInvoiceNumber('1001-01'), '1001');

  assert.equal(normalizeInvoiceNumber('900375'), '900375');
  assert.equal(normalizeInvoiceNumber('90037501'), '90037501');
  assert.equal(normalizeInvoiceNumber('900375 1892'), '900375 1892');
  assert.equal(normalizeInvoiceNumber('900375-189271'), '900375-189271');
  assert.equal(normalizeInvoiceNumber('123456789012'), '123456789012');
  assert.equal(normalizeInvoiceNumber('900375/01'), '900375/01');
  assert.equal(normalizeInvoiceNumber('1001/A'), '1001/A');
  assert.equal(normalizeInvoiceNumber('1001-A'), '1001-A');
  assert.equal(normalizeInvoiceNumber('A 12'), 'A 12');
  assert.equal(normalizeInvoiceNumber('INV 9'), 'INV 9');
  assert.equal(normalizeInvoiceNumber('  INV  9 '), 'INV 9');
  assert.equal(normalizeInvoiceNumber('12-01'), '12-01');
  assert.equal(normalizeInvoiceNumber('375 01'), '375 01');
  assert.equal(normalizeInvoiceNumber('900375 00'), '900375 00');
  assert.equal(normalizeInvoiceNumber('900375 10'), '900375 10');
  assert.equal(normalizeInvoiceNumber('900375 2'), '900375 2');
  assert.equal(normalizeInvoiceNumber('900375-1'), '900375-1');

  assert.equal(normalizeInvoiceNumber('900375 10', 10), '900375');
  assert.equal(normalizeInvoiceNumber('900375 2', 2), '900375');
  assert.equal(normalizeInvoiceNumber('900375-1', 1), '900375');
  assert.equal(normalizeInvoiceNumber('900375 2', 1), '900375 2');
  assert.equal(normalizeInvoiceNumber('900375 01', 2), '900375');
  assert.equal(normalizeInvoiceNumber('A 12', 12), 'A 12');
  assert.equal(normalizeInvoiceNumber('INV 9', 9), 'INV 9');
  assert.equal(normalizeInvoiceNumber(''), '');
  assert.equal(normalizeInvoiceNumber(null), '');
});

test('duplicate guard matches supplier, normalized number, and date', () => {
  const page1 = {
    supplierId: 'sup-tony',
    invoiceNumber: canonicalInvoiceNumber('900375 01'),
    invoiceDate: canonicalInvoiceDate('2026-10-11'),
  };
  const page2 = {
    supplierId: 'sup-tony',
    invoiceNumber: canonicalInvoiceNumber('900375-02'),
    invoiceDate: canonicalInvoiceDate('2026-10-11'),
  };
  assert.deepEqual(page1, page2);
  assert.equal(page1.invoiceNumber, '900375');
  assert.equal(page1.invoiceDate, '2026-10-11');

  assert.notEqual(canonicalInvoiceNumber('900375 01'), canonicalInvoiceNumber('900376 01'));
  assert.notEqual(canonicalInvoiceDate('2026-10-11'), canonicalInvoiceDate('2026-10-12'));
  assert.equal(canonicalInvoiceNumber('900375'), '900375');
  assert.equal(canonicalInvoiceNumber('90037501'), '90037501');
  assert.equal(canonicalInvoiceNumber('900375 1892'), '900375 1892');
  assert.equal(canonicalInvoiceNumber('1001/A'), '1001/a');
  assert.equal(canonicalInvoiceNumber('1001-A'), '1001-a');
  assert.equal(canonicalInvoiceNumber('  INV  9 '), 'inv 9');
  assert.equal(canonicalInvoiceNumber('A 12'), 'a 12');
  assert.notEqual(canonicalInvoiceNumber('A 12'), canonicalInvoiceNumber('A12'));
  assert.equal(canonicalInvoiceNumber('unread'), null);
});
