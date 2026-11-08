import assert from 'node:assert/strict';
import test from 'node:test';
import { receivingLogsFromInvoice } from '@/lib/domains/receiving/receivingBridge';
import { draftResolutionFingerprint, buildAuthoritativeOcrDraft } from '@/lib/domains/receiving/invoiceOcrDraft';
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

test('invoice lines without a server delivery id are not given a hash id', () => {
  assert.equal(receivingLogsFromInvoice(invoice).length, 0);
});

test('server delivery ids survive quantity edits and line reordering', () => {
  const first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';
  const withIds: InvoiceOcrResult = {
    ...invoice,
    lineItems: [
      { ...invoice.lineItems[0]!, deliveryId: first },
      { ...invoice.lineItems[1]!, deliveryId: second },
    ],
  };
  const logs = receivingLogsFromInvoice(withIds);
  assert.deepEqual(
    logs.map((log) => log.id),
    [first, second]
  );
  const edited: InvoiceOcrResult = {
    ...withIds,
    lineItems: [
      { ...withIds.lineItems[1]!, quantity: 9, unitCost: 1 },
      { ...withIds.lineItems[0]!, quantity: 8, unitCost: 2 },
    ],
  };
  assert.deepEqual(
    receivingLogsFromInvoice(edited).map((log) => log.id),
    [second, first]
  );
  const draft = buildAuthoritativeOcrDraft({
    vendorName: 'North',
    invoiceNumber: 'INV-100',
    invoiceDate: '2026-11-08',
    totalAmount: 1,
    departmentBreakdown: { PRODUCE: 1 },
    lines: [
      {
        item_name: 'Apples',
        product_id: 'a',
        quantity: 1,
        unit: 'cases',
        unit_cost: 1,
        department: 'PRODUCE',
        case_pack_size: 1,
        line_confidence: 0.99,
        requires_approval: false,
        delivery_id: first,
      },
      {
        item_name: 'Pears',
        product_id: 'b',
        quantity: 1,
        unit: 'cases',
        unit_cost: 1,
        department: 'PRODUCE',
        case_pack_size: 1,
        line_confidence: 0.99,
        requires_approval: false,
        delivery_id: second,
      },
    ],
  });
  const reordered = { ...draft, lines: [draft.lines[1]!, draft.lines[0]!] };
  assert.equal(draftResolutionFingerprint(draft), draftResolutionFingerprint(reordered));
});
