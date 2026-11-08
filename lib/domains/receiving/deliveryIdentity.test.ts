import assert from 'node:assert/strict';
import test from 'node:test';
import { newReceivingDeliveryId } from '@/lib/domains/receiving/receivingBridge';
import {
  parseReceivingSheetValues,
} from '@/lib/domains/receiving/receivingSheet';
import {
  isDeliveryUuid,
  isRetiredPositionalDeliveryId,
  receivingDeliveryPayloadHash,
} from '@/lib/domains/receiving/deliveryIdentity';
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

test('invoice lines mint a UUID once and the practice invoice stays reserved', () => {
  const item = {
    name: 'Apples',
    department: 'PRODUCE' as const,
    quantity: 1,
    unit: 'cases',
    casePackSize: 10,
    subUnit: 'units',
    unitCost: 4,
    totalCost: 4,
  };
  const first = newReceivingDeliveryId({ invoiceNumber: 'INV-9' }, item, 0);
  const second = newReceivingDeliveryId({ invoiceNumber: 'INV-9' }, item, 0);
  assert.equal(isDeliveryUuid(first), true);
  assert.notEqual(first, second);
  assert.match(newReceivingDeliveryId({ invoiceNumber: DEMO_INVOICE_NUMBER }, item, 0), /INV-2026-1020-TD/);
});

test('payload hash changes when quantity or cost changes and ignores uuid', () => {
  const base = {
    itemName: 'Apples',
    productId: null,
    casesReceived: 2,
    caseCost: 10,
    packSize: 4,
    splitFactor: 1,
    retailPrice: 3,
    caseRetailPrice: null,
  };
  assert.equal(receivingDeliveryPayloadHash(base), receivingDeliveryPayloadHash({ ...base, casesReceived: 2.0 }));
  assert.notEqual(receivingDeliveryPayloadHash(base), receivingDeliveryPayloadHash({ ...base, caseCost: 11 }));
  assert.notEqual(receivingDeliveryPayloadHash(base), receivingDeliveryPayloadHash({ ...base, casesReceived: 3 }));
});
