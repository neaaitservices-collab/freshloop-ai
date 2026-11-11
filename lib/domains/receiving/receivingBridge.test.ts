import assert from 'node:assert/strict';
import test from 'node:test';
import {
  identifiedLineCanPost,
  invoiceScanBatchFields,
  invoiceScanPostFields,
  receivingLogsFromInvoice,
} from '@/lib/domains/receiving/receivingBridge';
import { splitUnreadReceivingLines } from '@/lib/domains/receiving/receivingLogPost';
import type { InvoiceOcrResult } from '@/lib/types';

const invoice: InvoiceOcrResult = {
  vendorName: 'Tony Deodato & Sons',
  invoiceNumber: 'INV-100',
  invoiceDate: '2026-11-01',
  totalAmount: 518,
  departmentBreakdown: { PRODUCE: 518, DAIRY: 0, BAKERY: 0, PANTRY: 0, DELI_KITCHEN: 0, GROCERY: 0 },
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

test('a zero quantity stays unpostable after the supplier assigns a delivery id', () => {
  assert.equal(identifiedLineCanPost(4), true);
  assert.equal(identifiedLineCanPost(0), false);
  assert.equal(identifiedLineCanPost(undefined), false);
});

test('scanned rows stay unposted until the server assigns a supplier delivery id', () => {
  const logs = receivingLogsFromInvoice(invoice);
  assert.equal(logs.length, 2);
  assert.equal(logs[0]?.canPost, false);
  assert.equal(logs[0]?.id, 'unassigned-invoice-line-1');
  assert.equal(logs[1]?.id, 'unassigned-invoice-line-2');
  assert.equal(logs[0]?.invoiceNumber, 'INV-100');
  assert.equal(logs[0]?.casesReceived, 4);
  assert.equal(logs[0]?.draftLineIndex, 0);
  assert.equal(logs[1]?.draftLineIndex, 1);
  assert.equal(logs[1]?.casesReceived, 0);
  assert.deepEqual(invoiceScanPostFields(logs[0]!), { invoiceOcr: true });
  assert.deepEqual(invoiceScanBatchFields(logs), { invoiceOcr: true });
  const split = splitUnreadReceivingLines([
    { itemName: 'Avocados Hass', casesReceived: 4, externalLogId: 'keep' },
    { itemName: 'Lemons', casesReceived: 0, externalLogId: 'skip' },
  ]);
  assert.equal(split.rest.length, 1);
  assert.equal(split.rest[0]?.externalLogId, 'keep');
  assert.equal(split.unread[0]?.stock.posted, false);
  assert.match(split.unread[0]?.stock.reason ?? '', /not read/i);
});

test('a saved scan id is sent as acceptance of that server draft', () => {
  const logs = receivingLogsFromInvoice({ ...invoice, draftId: 'draft-77' });
  assert.equal(logs[0]?.draftId, 'draft-77');
  assert.equal(logs[1]?.draftLineIndex, 1);
  assert.deepEqual(invoiceScanPostFields(logs[0]!), {
    invoiceOcr: true,
    draftId: 'draft-77',
    acceptDraft: true,
    draftLineIndex: 0,
  });
  assert.deepEqual(invoiceScanBatchFields(logs), {
    invoiceOcr: true,
    draftId: 'draft-77',
    acceptDraft: true,
  });
  assert.deepEqual(
    invoiceScanPostFields({ invoiceNumber: undefined, draftId: undefined, draftLineIndex: undefined }),
    {}
  );
});
