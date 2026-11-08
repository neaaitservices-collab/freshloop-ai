import assert from 'node:assert/strict';
import test from 'node:test';
import { receivingLogsFromInvoice } from '@/lib/domains/receiving/receivingBridge';
import type { InvoiceOcrResult } from '@/lib/types';

const invoice: InvoiceOcrResult = {
  vendorName: 'Tony Deodato & Sons',
  invoiceNumber: 'INV-100',
  invoiceDate: '2026-11-01',
  totalAmount: 518,
  departmentBreakdown: { PRODUCE: 518, DAIRY: 0, BAKERY: 0, PANTRY: 0 },
  lineItems: [
    {
      name: 'Avocados Hass',
      productId: 'avo',
      department: 'PRODUCE',
      quantity: 4,
      unit: 'cases',
      casePackSize: 36,
      subUnit: 'units',
      unitCost: 84.5,
      totalCost: 338,
    },
    {
      name: 'Avocados Hass Organic',
      productId: 'avo',
      department: 'PRODUCE',
      quantity: 2,
      unit: 'cases',
      casePackSize: 36,
      subUnit: 'units',
      unitCost: 90,
      totalCost: 180,
    },
    {
      name: 'Lemons',
      department: 'PRODUCE',
      quantity: 0,
      unit: 'cases',
      casePackSize: 40,
      subUnit: 'units',
      unitCost: 30,
      totalCost: 0,
    },
  ],
};

test('two lines for the same SKU stay separate and a missing quantity stays zero', () => {
  const logs = receivingLogsFromInvoice(invoice);
  assert.equal(logs.length, 3);
  assert.notEqual(logs[0]?.id, logs[1]?.id);
  assert.equal(logs[0]?.casesReceived, 4);
  assert.equal(logs[1]?.casesReceived, 2);
  assert.equal(logs[1]?.caseCost, 90);
  assert.equal(logs[2]?.casesReceived, 0);
  assert.match(logs[0]?.id ?? '', /^scan-inv-100-0-/);
  assert.match(logs[1]?.id ?? '', /^scan-inv-100-1-/);
});
