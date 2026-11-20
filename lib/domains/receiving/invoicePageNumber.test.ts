import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalInvoiceNumber,
  mergedPageInvoiceNumber,
  pageInvoiceDuplicateKeys,
} from '@/lib/domains/receiving/invoiceDeliveryId';

test('canonical invoice numbers keep a printed page suffix', () => {
  assert.equal(canonicalInvoiceNumber('900375 01'), '900375 01');
  assert.equal(canonicalInvoiceNumber('900375 02'), '900375 02');
  assert.equal(canonicalInvoiceNumber('2024 01'), '2024 01');
  assert.equal(canonicalInvoiceNumber('1001-01'), '1001-01');
  assert.equal(canonicalInvoiceNumber('900375'), '900375');
  assert.equal(canonicalInvoiceNumber('1001/A'), '1001/a');
  assert.equal(canonicalInvoiceNumber('1001-A'), '1001-a');
  assert.equal(canonicalInvoiceNumber('  INV  9 '), 'inv 9');
  assert.equal(canonicalInvoiceNumber('A 12'), 'a 12');
  assert.notEqual(canonicalInvoiceNumber('A 12'), canonicalInvoiceNumber('A12'));
  assert.notEqual(canonicalInvoiceNumber('1001/A'), canonicalInvoiceNumber('1001-A'));
  assert.equal(canonicalInvoiceNumber('unread'), null);
});

test('a page suffix is removed only for one in-order multi-page scan', () => {
  assert.equal(
    mergedPageInvoiceNumber([
      { index: 1, invoiceNumber: '900375 01' },
      { index: 2, invoiceNumber: '900375 02' },
    ]),
    '900375'
  );
  assert.equal(mergedPageInvoiceNumber([{ index: 1, invoiceNumber: '2024 01' }]), null);
  assert.equal(mergedPageInvoiceNumber([{ index: 1, invoiceNumber: '1001-01' }]), null);
  assert.equal(
    mergedPageInvoiceNumber([
      { index: 1, invoiceNumber: '1001-01' },
      { index: 2, invoiceNumber: '1001-02' },
    ]),
    null
  );
  assert.equal(
    mergedPageInvoiceNumber([
      { index: 1, invoiceNumber: '2024 01' },
      { index: 2, invoiceNumber: '2024 02' },
    ]),
    null
  );
  assert.equal(
    mergedPageInvoiceNumber([
      { index: 1, invoiceNumber: '900375 01' },
      { index: 2, invoiceNumber: '900376 02' },
    ]),
    null
  );
  assert.equal(
    mergedPageInvoiceNumber([
      { index: 1, invoiceNumber: '900375 02' },
      { index: 2, invoiceNumber: '900375 01' },
    ]),
    null
  );
  assert.equal(mergedPageInvoiceNumber([{ index: 1, invoiceNumber: '900375' }]), null);
});

test('duplicate guard loads the raw page key and the merged base', () => {
  const fromBase = pageInvoiceDuplicateKeys('900375');
  assert.ok(fromBase.invoiceKeys.includes('900375'));
  assert.ok(fromBase.invoiceKeys.includes('900375 01'));
  assert.ok(fromBase.compacts.includes('900375'));
  assert.ok(fromBase.compacts.includes('90037501'));

  const fromRaw = pageInvoiceDuplicateKeys('900375 01');
  assert.ok(fromRaw.invoiceKeys.includes('900375 01'));
  assert.ok(fromRaw.invoiceKeys.includes('900375'));
  assert.ok(fromRaw.compacts.includes('90037501'));
  assert.ok(fromRaw.compacts.includes('900375'));

  const shortPage = pageInvoiceDuplicateKeys('2024 01');
  assert.deepEqual(shortPage.invoiceKeys, ['2024 01']);
  assert.equal(shortPage.invoiceKeys.includes('2024'), false);

  const hyphen = pageInvoiceDuplicateKeys('1001-01');
  assert.deepEqual(hyphen.invoiceKeys, ['1001-01']);
  assert.equal(hyphen.invoiceKeys.includes('1001'), false);
});
