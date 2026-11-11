import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_INVOICE_NUMBER } from '@/lib/domains/receiving/sampleReceivingGuard';
import {
  invoiceScanPostFields,
  receivingLogsFromInvoice,
} from '@/lib/domains/receiving/receivingBridge';
import {
  applyOpenScanChoice,
  clearOpenScanChoice,
  readOpenScanChoice,
  rememberOpenScanChoice,
} from '@/lib/domains/receiving/openInvoiceScanChoice';
import {
  invoiceResultFromStoredDraft,
  pickOpenInvoiceScan,
  type OpenScanRow,
} from '@/lib/domains/receiving/openInvoiceScan';

const now = new Date('2026-11-11T12:00:00.000Z');

function row(overrides: Partial<OpenScanRow> & Pick<OpenScanRow, 'id' | 'createdAt'>): OpenScanRow {
  return {
    staffId: 'clerk-1',
    payload: {
      vendorName: 'Tony Deodato & Sons',
      invoiceNumber: 'INV-100',
      invoiceDate: '2026-11-01',
      totalAmount: 40,
      departmentBreakdown: { PRODUCE: 40 },
      lines: [
        {
          product_id: 'avo',
          quantity: 2,
          quantity_kind: 'cases',
          unit_cost: 20,
          line_name: 'Avocados Hass',
          department: 'PRODUCE',
          case_pack_size: 36,
          line_confidence: 0.95,
          requires_approval: false,
        },
        {
          product_id: '',
          quantity: 0,
          quantity_kind: 'units',
          unit_cost: 4,
          line_name: '',
          department: 'DAIRY',
          case_pack_size: 1,
          line_confidence: 0.2,
          requires_approval: true,
        },
      ],
    },
    expiresAt: new Date('2026-11-11T14:00:00.000Z'),
    consumedAt: null,
    ...overrides,
  };
}

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

test('a refresh keeps the newest open scan and its draft line indexes', () => {
  const older = row({ id: 'draft-old', createdAt: new Date('2026-11-11T10:00:00.000Z') });
  const newer = row({ id: 'draft-new', createdAt: new Date('2026-11-11T11:00:00.000Z') });
  const consumed = row({
    id: 'draft-posted',
    createdAt: new Date('2026-11-11T11:30:00.000Z'),
    consumedAt: new Date('2026-11-11T11:40:00.000Z'),
  });
  const expired = row({
    id: 'draft-expired',
    createdAt: new Date('2026-11-11T11:45:00.000Z'),
    expiresAt: new Date('2026-11-11T11:50:00.000Z'),
  });
  const otherClerk = row({
    id: 'draft-other',
    staffId: 'clerk-2',
    createdAt: new Date('2026-11-11T11:50:00.000Z'),
  });
  const picked = pickOpenInvoiceScan([consumed, expired, older, otherClerk, newer], 'clerk-1', now);
  assert.equal(picked?.id, 'draft-new');

  const invoice = invoiceResultFromStoredDraft(picked!);
  assert.ok(invoice);
  assert.equal(invoice?.draftId, 'draft-new');
  assert.equal(invoice?.lineItems.length, 2);
  assert.equal(invoice?.lineItems[1]?.name, 'Unread line 2');
  const logs = receivingLogsFromInvoice(invoice!);
  assert.equal(logs.length, 2);
  assert.equal(logs[0]?.draftId, 'draft-new');
  assert.equal(logs[0]?.draftLineIndex, 0);
  assert.equal(logs[1]?.draftLineIndex, 1);
  assert.equal(logs[1]?.casesReceived, 0);
  assert.deepEqual(invoiceScanPostFields(logs[0]!), {
    invoiceOcr: true,
    draftId: 'draft-new',
    acceptDraft: true,
    draftLineIndex: 0,
  });
});

test('a consumed, expired, sample, or empty draft is not restored', () => {
  const sample = row({
    id: 'draft-sample',
    createdAt: new Date('2026-11-11T11:00:00.000Z'),
    payload: {
      vendorName: 'Sample',
      invoiceNumber: DEMO_INVOICE_NUMBER,
      invoiceDate: '2026-11-01',
      totalAmount: 1,
      departmentBreakdown: {},
      lines: [
        {
          product_id: 'x',
          quantity: 1,
          unit_cost: 1,
          line_name: 'Practice apples',
          department: 'PRODUCE',
          line_confidence: 1,
          requires_approval: false,
        },
      ],
    },
  });
  assert.equal(pickOpenInvoiceScan([sample], 'clerk-1', now), null);
  assert.equal(
    pickOpenInvoiceScan(
      [row({ id: 'gone', createdAt: now, consumedAt: now })],
      'clerk-1',
      now
    ),
    null
  );
  assert.equal(invoiceResultFromStoredDraft({ id: 'empty', payload: { lines: [] } }), null);
});

test('discard clears the supplier choice kept for the open scan', () => {
  const storage = memoryStorage();
  rememberOpenScanChoice(
    { draftId: 'draft-new', supplierId: 'sup-1', manualReviewOverride: true },
    storage
  );
  const choice = readOpenScanChoice(storage);
  assert.deepEqual(choice, {
    draftId: 'draft-new',
    supplierId: 'sup-1',
    manualReviewOverride: true,
  });
  const logs = applyOpenScanChoice(
    [{ id: 'unassigned-invoice-line-1', itemName: 'Avocados', casesReceived: 2, caseCost: 20, draftId: 'draft-new' }],
    choice
  );
  assert.equal(logs[0]?.manualReviewOverride, true);
  clearOpenScanChoice(storage);
  assert.equal(readOpenScanChoice(storage), null);
});
