import assert from 'node:assert/strict';
import test from 'node:test';
import { uuidV5 } from '@/lib/domains/receiving/invoiceDeliveryId';
import { receivingLogsFromInvoice } from '@/lib/domains/receiving/receivingBridge';
import {
  canonicalInvoiceNumber,
  INVOICE_NUMBER_REUSE_POLICY,
  SUPPLIER_REQUIRED_ERROR,
} from '@/lib/domains/receiving/invoiceDeliveryId';
import {
  parseReceivingSheetValues,
} from '@/lib/domains/receiving/receivingSheet';
import {
  isDeliveryUuid,
  isRetiredPositionalDeliveryId,
  LEGACY_SCAN_STASH_ERROR,
  receivingDeliveryPayloadHash,
} from '@/lib/domains/receiving/deliveryIdentity';
import { interpretReceivingBatchResponse } from '@/lib/domains/receiving/receivingBatchResult';
import {
  receivingLineHttpStatus,
  receivingValidationHttpStatus,
  validateReceivingLogPostInput,
} from '@/lib/domains/receiving/receivingLogPost';
const HEADERS = ['Select Item', 'New Inventory Count', 'New Case Cost', 'Delivery ID'];
const APPLE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PEAR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function ids(values: unknown[][]) {
  return parseReceivingSheetValues(values).map((row) => ({
    id: row.id,
    itemName: row.itemName,
    canPost: row.canPost,
  }));
}

test('uuid v5 matches the RFC 4122 DNS example', () => {
  assert.equal(
    uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
    '2ed6657d-e927-568b-95e1-2665a8aea6a2'
  );
});

test('sheet identity follows the persisted UUID, not the row position', () => {
  const applesFirst = ids([
    HEADERS,
    ['Apples', 2, 10, APPLE],
    ['Pears', 1, 5, PEAR],
  ]);
  const inserted = ids([
    HEADERS,
    ['New top row', 3, 8, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
    ['Apples', 2, 10, APPLE],
    ['Pears', 1, 5, PEAR],
  ]);
  const sorted = ids([
    HEADERS,
    ['Pears', 1, 5, PEAR],
    ['Apples', 2, 10, APPLE],
  ]);

  assert.equal(applesFirst[0]?.id, APPLE);
  assert.equal(inserted[1]?.id, APPLE);
  assert.equal(sorted[1]?.id, APPLE);
  assert.equal(sorted[0]?.id, PEAR);
  assert.equal(applesFirst[0]?.canPost, true);
});

test('a sheet without a Delivery ID does not invent a receivable id', () => {
  const logs = parseReceivingSheetValues([
    ['Select Item', 'New Inventory Count', 'New Case Cost'],
    ['Apples', 2, 10],
    ['Apples', 2, 10],
  ]);
  assert.equal(logs.length, 2);
  assert.equal(logs[0]?.canPost, false);
  assert.equal(logs[1]?.canPost, false);
  assert.equal(isDeliveryUuid(logs[0]?.id ?? ''), false);
  assert.notEqual(logs[0]?.id, logs[1]?.id);
});

test('identical deliveries keep distinct persisted ids', () => {
  const logs = parseReceivingSheetValues([
    HEADERS,
    ['Apples', 2, 10, APPLE],
    ['Apples', 2, 10, PEAR],
  ]);
  assert.deepEqual(
    logs.map((row) => row.id),
    [APPLE, PEAR]
  );
  assert.equal(logs[0]?.canPost, true);
  assert.equal(logs[1]?.canPost, true);
});

test('positional ids are rejected and do not validate as a new delivery', () => {
  assert.equal(isRetiredPositionalDeliveryId('sheet-row-2'), true);
  assert.equal(isDeliveryUuid('sheet-row-2'), false);
  const parsed = validateReceivingLogPostInput({
    itemName: 'Apples',
    casesReceived: 1,
    caseCost: 4,
    packSize: 1,
    splitFactor: 1,
    retailUnit: 'units',
    marginMode: '40',
    currentRetailPrice: 2,
    externalLogId: 'sheet-row-2',
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(receivingValidationHttpStatus(parsed.error), 409);
  assert.equal(
    receivingLineHttpStatus({ posted: false, conflict: true, reason: 'changed' }),
    409
  );
  assert.equal(receivingLineHttpStatus({ posted: true, productId: 'p', productName: 'A', unitsAdded: 1, onHand: 1, transactionId: 't', idempotent: true }), 200);
});

test('invoice numbers keep punctuation and invoice lines stay unposted until the server assigns ids', () => {
  assert.equal(canonicalInvoiceNumber('1001/A'), '1001/a');
  assert.equal(canonicalInvoiceNumber('1001-A'), '1001-a');
  assert.notEqual(canonicalInvoiceNumber('1001/A'), canonicalInvoiceNumber('1001-A'));
  assert.equal(canonicalInvoiceNumber('  INV  9 '), 'inv9');
  assert.equal(canonicalInvoiceNumber('1001 / A'), canonicalInvoiceNumber('1001/A'));
  assert.equal(canonicalInvoiceNumber('unread'), null);
  assert.match(INVOICE_NUMBER_REUSE_POLICY, /date and year are not part/i);
  assert.match(SUPPLIER_REQUIRED_ERROR, /Select a saved supplier/);
  const apples = {
    name: 'Apples',
    department: 'PRODUCE' as const,
    quantity: 2,
    unit: 'cases',
    casePackSize: 10,
    subUnit: 'units',
    unitCost: 4,
    totalCost: 8,
    productId: 'sku-apple',
  };
  const logs = receivingLogsFromInvoice({
    vendorName: 'Vendor',
    invoiceNumber: '1001/A',
    invoiceDate: '2026-11-08',
    totalAmount: 8,
    departmentBreakdown: { PRODUCE: 8, DAIRY: 0, BAKERY: 0, PANTRY: 0 },
    lineItems: [apples, { ...apples, name: 'Pears', productId: 'sku-pear' }],
    rawSummary: '',
  });
  assert.equal(logs[0]?.canPost, false);
  assert.equal(logs[0]?.printedName, 'Apples');
  assert.equal(logs[0]?.itemName, 'Apples');
  assert.match(logs[0]?.id ?? '', /^unassigned-invoice-line-/);
  assert.equal(logs[1]?.productId, 'sku-pear');
});

test('a 409 batch response still returns the posted row and the conflict', () => {
  const interpreted = interpretReceivingBatchResponse(409, {
    success: false,
    error: 'conflict',
    results: [
      {
        externalLogId: APPLE,
        itemName: 'Apples',
        stock: { posted: true, idempotent: true, unitsAdded: 4, onHand: 4, productId: 'p1' },
      },
      {
        externalLogId: PEAR,
        itemName: 'Pears',
        stock: { posted: false, conflict: true, reason: 'different cost' },
      },
    ],
  });
  assert.equal(interpreted.apply, true);
  assert.equal(interpreted.results[0]?.stock.posted, true);
  assert.equal(interpreted.results[0]?.stock.idempotent, true);
  assert.equal(interpreted.results[1]?.stock.conflict, true);
});

test('payload hash ignores shelf price and changes when case cost changes', () => {
  const base = {
    itemName: 'Apples',
    productId: null,
    casesReceived: 2,
    caseCost: 10,
    packSize: 4,
    splitFactor: 1,
  };
  assert.equal(receivingDeliveryPayloadHash(base), receivingDeliveryPayloadHash({ ...base, casesReceived: 2.0 }));
  assert.notEqual(receivingDeliveryPayloadHash(base), receivingDeliveryPayloadHash({ ...base, caseCost: 11 }));
  assert.notEqual(receivingDeliveryPayloadHash(base), receivingDeliveryPayloadHash({ ...base, casesReceived: 3 }));
});

test('duplicate sheet UUIDs block every row that uses them', () => {
  const logs = parseReceivingSheetValues([
    HEADERS,
    ['Apples', 2, 10, APPLE],
    ['Pears', 1, 5, APPLE],
    ['Berries', 1, 4, PEAR],
  ]);
  assert.equal(logs[0]?.canPost, false);
  assert.equal(logs[1]?.canPost, false);
  assert.equal(logs[2]?.canPost, true);
  assert.equal(logs[2]?.id, PEAR);
  assert.equal(isDeliveryUuid(logs[0]?.id ?? ''), false);
});

test('legacy scan stash ids are rejected with a rescan message', () => {
  const parsed = validateReceivingLogPostInput({
    itemName: 'Apples',
    casesReceived: 1,
    caseCost: 4,
    packSize: 1,
    splitFactor: 1,
    retailUnit: 'units',
    marginMode: '40',
    currentRetailPrice: 2,
    externalLogId: 'scan-inv-9-0-apples',
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(parsed.error, LEGACY_SCAN_STASH_ERROR);
    assert.equal(receivingValidationHttpStatus(parsed.error), 409);
  }
});
