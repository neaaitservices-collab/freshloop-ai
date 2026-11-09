import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_INVOICE_NUMBER,
  SAMPLE_RECEIVING_REJECTION,
  gateStoredOcrDraft,
  sampleInvoiceCommitRejection,
  sampleReceivingRejection,
} from '@/lib/domains/receiving/sampleReceivingGuard';
import { SAMPLE_RECEIVING_LOGS } from '@/lib/domains/receiving/receivingSheet';
import {
  arrangeReceivingBatch,
  validateReceivingLogPostInput,
  type ReceivingLogPostInput,
} from '@/lib/domains/receiving/receivingLogPost';

const genuine = {
  itemName: 'Local Honeycrisp',
  casesReceived: 8,
  caseCost: 90,
  packSize: 40,
  splitFactor: 1,
  retailUnit: 'lbs' as const,
  marginMode: '40' as const,
  currentRetailPrice: 3.25,
};

function line(over: Partial<ReceivingLogPostInput>): ReceivingLogPostInput {
  return {
    itemName: 'Blueberries',
    casesReceived: 6,
    caseCost: 32.4,
    packSize: 12,
    splitFactor: 1,
    retailUnit: 'units',
    marginMode: '40',
    currentRetailPrice: 2,
    ...over,
  };
}

test('reserved sample ids and the practice invoice number are rejected', () => {
  for (const row of SAMPLE_RECEIVING_LOGS) {
    assert.equal(
      sampleReceivingRejection({ externalLogId: row.id }),
      SAMPLE_RECEIVING_REJECTION
    );
  }
  assert.equal(
    sampleReceivingRejection({ externalLogId: 'SAMPLE-AVOCADO' }),
    SAMPLE_RECEIVING_REJECTION
  );
  assert.equal(
    sampleReceivingRejection({
      externalLogId: `scan-${DEMO_INVOICE_NUMBER}-avocados-hass-mexico`,
    }),
    SAMPLE_RECEIVING_REJECTION
  );
  assert.equal(
    sampleInvoiceCommitRejection({ invoiceNumber: DEMO_INVOICE_NUMBER }),
    SAMPLE_RECEIVING_REJECTION
  );
});

test('genuine sheet and OCR values that match a fixture still post', () => {
  const sheetBlueberries = {
    externalLogId: '11111111-1111-4111-8111-111111111111',
    itemName: 'Blueberries',
    casesReceived: 6,
    caseCost: 32.4,
  };
  assert.equal(sampleReceivingRejection(sheetBlueberries), null);

  const parsed = validateReceivingLogPostInput({
    ...genuine,
    itemName: sheetBlueberries.itemName,
    casesReceived: sheetBlueberries.casesReceived,
    caseCost: sheetBlueberries.caseCost,
    externalLogId: sheetBlueberries.externalLogId,
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(sampleReceivingRejection(parsed.input), null);

  assert.equal(
    sampleInvoiceCommitRejection({ invoiceNumber: 'INV-500' }),
    null
  );
  const gate = gateStoredOcrDraft({
    expiresAt: new Date(Date.now() + 60_000),
    payload: {
      invoiceNumber: 'INV-500',
    },
  });
  assert.equal(gate.ok, true);
});

test('a missing OCR draft is 404 and does not run the ledger commit', async () => {
  let writes = 0;
  const gate = gateStoredOcrDraft(null);
  assert.equal(gate.ok, false);
  if (!gate.ok) {
    assert.equal(gate.status, 404);
    assert.match(gate.error, /not found/i);
  } else {
    writes += 1;
  }
  assert.equal(writes, 0);

  const practice = gateStoredOcrDraft({
    expiresAt: new Date(Date.now() + 60_000),
    payload: { invoiceNumber: DEMO_INVOICE_NUMBER },
  });
  assert.equal(practice.ok, false);
  if (!practice.ok) assert.equal(practice.status, 409);
});

test('a practice invoice id reaches the sample guard before the UUID rule', () => {
  const parsed = validateReceivingLogPostInput(
    line({ externalLogId: `scan-${DEMO_INVOICE_NUMBER}-apple` })
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.input.externalLogId, `scan-${DEMO_INVOICE_NUMBER}-apple`);
  const arranged = arrangeReceivingBatch([parsed.input]);
  assert.equal(arranged.toPost.length, 0);
  assert.match(arranged.results[0]?.stock.reason ?? '', /preview only/i);
});

test('mixed batch keeps sample rejections and genuine rows in request order', () => {
  const arranged = arrangeReceivingBatch([
    line({ externalLogId: 'sample-avocado', itemName: 'Hass Avocados (Mexico)', casesReceived: 4, caseCost: 84.5 }),
    line({ externalLogId: '22222222-2222-4222-8222-222222222222', itemName: 'Blueberries', casesReceived: 6, caseCost: 32.4 }),
    line({ externalLogId: 'sample-tomato', itemName: 'Hot House Tomatoes (Ontario)', casesReceived: 3, caseCost: 42 }),
  ]);

  assert.deepEqual(arranged.postIndexes, [1]);
  assert.equal(arranged.toPost.length, 1);
  assert.equal(arranged.toPost[0]?.externalLogId, '22222222-2222-4222-8222-222222222222');
  assert.equal(arranged.results[0]?.stock.posted, false);
  assert.equal(arranged.results[2]?.stock.posted, false);
  assert.match(arranged.results[0]?.stock.reason ?? '', /preview only/i);

  const posted = arranged.toPost.map((row) => ({
    externalLogId: row.externalLogId,
    itemName: row.itemName,
    stock: { posted: true as const },
  }));
  posted.forEach((row, index) => {
    const slot = arranged.postIndexes[index];
    if (slot === undefined) return;
    arranged.results[slot] = row;
  });

  assert.deepEqual(
    arranged.results.map((row) => row.externalLogId),
    ['sample-avocado', '22222222-2222-4222-8222-222222222222', 'sample-tomato']
  );
  assert.equal(arranged.results[1]?.stock.posted, true);
  assert.equal(arranged.results[0]?.stock.posted, false);
  assert.equal(arranged.results[2]?.stock.posted, false);
});
