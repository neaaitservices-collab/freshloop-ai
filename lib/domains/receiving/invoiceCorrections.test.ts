import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCorrectionDraft,
  createCorrectionDraft,
  patchCorrectionDraft,
} from '@/lib/domains/receiving/invoiceCorrections';
import type { InvoiceOcrResult } from '@/lib/types';
import { accountVoiceCommit } from '@/lib/domains/inventory/voiceCommit';

const scan: InvoiceOcrResult = {
  vendorName: '',
  invoiceNumber: '',
  invoiceDate: '2026-11-08',
  totalAmount: 0,
  departmentBreakdown: { PRODUCE: 0, DAIRY: 0, BAKERY: 0, PANTRY: 0 },
  lineItems: [
    {
      name: 'Unread line 1',
      department: 'PRODUCE',
      quantity: 0,
      unit: 'cases',
      casePackSize: 1,
      subUnit: 'units',
      unitCost: 2,
      totalCost: 0,
    },
  ],
};

test('correction fields stay editable through a multi-digit quantity and a full name', () => {
  const initial = createCorrectionDraft(scan);
  assert.equal(initial.lines[0]?.editQuantity, true);
  assert.equal(initial.lines[0]?.editName, true);
  assert.equal(initial.applied, false);
  const typedOne = patchCorrectionDraft(initial, { lineIndex: 0, quantityText: '1' });
  assert.equal(typedOne.lines[0]?.editQuantity, true);
  assert.equal(typedOne.applied, false);
  const typedTwelve = patchCorrectionDraft(typedOne, {
    lineIndex: 0,
    quantityText: '12',
    nameText: 'Honeycrisp Apples',
  });
  const named = patchCorrectionDraft(typedTwelve, {
    vendorText: 'North Market',
    invoiceText: 'INV-100',
  });
  assert.equal(named.lines[0]?.editName, true);
  assert.equal(named.lines[0]?.editQuantity, true);
  const applied = applyCorrectionDraft(scan, named);
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.equal(applied.result.vendorName, 'North Market');
  assert.equal(applied.result.invoiceNumber, 'INV-100');
  assert.equal(applied.result.lineItems[0]?.name, 'Honeycrisp Apples');
  assert.equal(applied.result.lineItems[0]?.quantity, 12);
  assert.equal(applied.draft.lines[0]?.editQuantity, true);
});

test('a replayed voice line with zero units does not count or write an audit log', () => {
  const account = accountVoiceCommit([
    { units: 0, action: 'rescue' },
    { units: 0, action: 'waste' },
  ]);
  assert.equal(account.transactionsCreated, 0);
  assert.equal(account.writeAuditLog, false);
  const wrote = accountVoiceCommit([{ units: 2, action: 'rescue' }]);
  assert.equal(wrote.transactionsCreated, 2);
  assert.equal(wrote.writeAuditLog, true);
});
