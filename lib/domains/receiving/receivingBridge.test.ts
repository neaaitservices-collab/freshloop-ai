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

test('scanned rows stay unposted until the server assigns a supplier delivery id', () => {
  const logs = receivingLogsFromInvoice(invoice);
  assert.equal(logs.length, 2);
  assert.equal(logs[0]?.canPost, false);
  assert.equal(logs[0]?.id, 'unassigned-invoice-line-1');
  assert.equal(logs[1]?.id, 'unassigned-invoice-line-2');
  assert.equal(logs[0]?.invoiceNumber, 'INV-100');
  assert.equal(logs[0]?.casesReceived, 4);
  assert.equal(logs[1]?.casesReceived, 0);
});
