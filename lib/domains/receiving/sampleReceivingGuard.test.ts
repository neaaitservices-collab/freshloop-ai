import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_INVOICE_NUMBER,
  SAMPLE_RECEIVING_REJECTION,
  sampleInvoiceCommitRejection,
  sampleReceivingRejection,
} from '@/lib/domains/receiving/sampleReceivingGuard';
import { SAMPLE_RECEIVING_LOGS } from '@/lib/domains/receiving/receivingSheet';
import { validateReceivingLogPostInput } from '@/lib/domains/receiving/receivingLogPost';

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

test('sample sheet ids and exact fixture rows are rejected', () => {
  for (const row of SAMPLE_RECEIVING_LOGS) {
    assert.equal(
      sampleReceivingRejection({ externalLogId: row.id, itemName: 'Renamed on the client' }),
      SAMPLE_RECEIVING_REJECTION
    );
    assert.equal(
      sampleReceivingRejection({
        externalLogId: 'sheet-row-99',
        itemName: row.itemName,
        casesReceived: row.casesReceived,
        caseCost: row.caseCost,
      }),
      SAMPLE_RECEIVING_REJECTION
    );
  }
  assert.equal(
    sampleReceivingRejection({ externalLogId: 'SAMPLE-AVOCADO' }),
    SAMPLE_RECEIVING_REJECTION
  );
});

test('sample invoice identity and lines are rejected without a browser source flag', () => {
  assert.equal(
    sampleReceivingRejection({
      externalLogId: `scan-${DEMO_INVOICE_NUMBER}-avocados-hass-mexico`,
      itemName: 'Catalog Avocado',
      casesReceived: 1,
      caseCost: 10,
    }),
    SAMPLE_RECEIVING_REJECTION
  );
  assert.equal(
    sampleInvoiceCommitRejection({
      invoiceNumber: DEMO_INVOICE_NUMBER,
      lines: [{ line_name: 'Something else', quantity: 1, unit_cost: 1 }],
    }),
    SAMPLE_RECEIVING_REJECTION
  );
  assert.equal(
    sampleReceivingRejection({
      externalLogId: 'scan-real-99-cream',
      itemName: 'Whole Heavy Cream 40%',
      casesReceived: 5,
      caseCost: 15.6,
    }),
    SAMPLE_RECEIVING_REJECTION
  );
});

test('genuine receipts with similar names still validate', () => {
  assert.equal(sampleReceivingRejection(genuine), null);
  assert.equal(
    sampleReceivingRejection({
      externalLogId: 'sheet-row-4',
      itemName: 'Honeycrisp Apples',
      casesReceived: 9,
      caseCost: 136,
    }),
    null
  );
  assert.equal(
    sampleReceivingRejection({
      externalLogId: 'sheet-row-8',
      itemName: 'Blueberries',
      casesReceived: 6,
      caseCost: 40,
    }),
    null
  );
  assert.equal(
    sampleInvoiceCommitRejection({
      invoiceNumber: 'INV-8841',
      vendorName: 'Tony Deodato & Sons Wholesale Produce',
      lines: [{ line_name: 'Local basil', quantity: 2, unit_cost: 12 }],
    }),
    null
  );
  const parsed = validateReceivingLogPostInput({
    ...genuine,
    externalLogId: 'sheet-row-3',
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(sampleReceivingRejection(parsed.input), null);
  }
});
