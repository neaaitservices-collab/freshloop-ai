import assert from 'node:assert/strict';
import test from 'node:test';
import { uuidV5 } from '@/lib/domains/receiving/invoiceDeliveryId';
import { invoiceLineDeliveryId, receivingLogsFromInvoice } from '@/lib/domains/receiving/receivingBridge';
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
import { DEMO_INVOICE_NUMBER } from '@/lib/domains/receiving/sampleReceivingGuard';

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

test('the same numbered invoice reuses line ids and a blank number does not invent one', () => {
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
  const pears = { ...apples, name: 'Pears', productId: 'sku-pear', quantity: 1, totalCost: 4 };
  const again = { ...apples, quantity: 9, unitCost: 99, totalCost: 99 };
  const first = invoiceLineDeliveryId('INV-9', [apples, pears], 0);
  const rescanned = invoiceLineDeliveryId('INV-9', [again, pears], 0);
  const otherLine = invoiceLineDeliveryId('INV-9', [apples, pears], 1);
  const otherInvoice = invoiceLineDeliveryId('INV-10', [apples], 0);
  assert.equal(first, rescanned);
  assert.equal(isDeliveryUuid(first ?? ''), true);
  assert.notEqual(first, otherLine);
  assert.notEqual(first, otherInvoice);
  const twoApples = invoiceLineDeliveryId('INV-9', [apples, apples], 1);
  assert.notEqual(first, twoApples);
  assert.equal(invoiceLineDeliveryId('', [apples], 0), null);
  assert.equal(invoiceLineDeliveryId('unread', [apples], 0), null);
  const missing = receivingLogsFromInvoice({
    vendorName: 'Vendor',
    invoiceNumber: '',
    invoiceDate: '2026-11-08',
    totalAmount: 4,
    departmentBreakdown: { PRODUCE: 4, DAIRY: 0, BAKERY: 0, PANTRY: 0 },
    lineItems: [apples],
    rawSummary: '',
  });
  assert.equal(missing[0]?.canPost, false);
  assert.match(missing[0]?.id ?? '', /^unassigned-invoice-line-/);
  assert.match(
    invoiceLineDeliveryId(DEMO_INVOICE_NUMBER, [apples], 0) ?? '',
    /INV-2026-1020-TD/
  );
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
