import assert from 'node:assert/strict';
import test from 'node:test';
import { quantityKindForInvoiceUnit } from '@/lib/domains/receiving/invoiceOcrCommit';
import { parseInvoiceIdentity, parseInvoiceLineFields } from '@/lib/domains/receiving/invoiceOcrParse';
import { gateStoredOcrDraft } from '@/lib/domains/receiving/sampleReceivingGuard';
import { isLedgerIdempotencyConflict } from '@/lib/domains/inventory/idempotencyConflict';
import { kitchenInboxReceiptQty } from '@/lib/domains/inventory/kitchenInbox';

test('missing invoice identity stays blank', () => {
  const identity = parseInvoiceIdentity({});
  assert.equal(identity.vendorName, '');
  assert.equal(identity.invoiceNumber, '');
  assert.ok(identity.gaps.some((gap) => gap.includes('Invoice number')));
  assert.ok(identity.gaps.some((gap) => gap.includes('Vendor')));
});

test('an unreadable quantity is not replaced with 1', () => {
  const line = parseInvoiceLineFields({ name: 'Lemons', quantity: 0, department: 'PRODUCE' }, 2);
  assert.equal(line.quantity, 0);
  assert.equal(line.quantityUnreadable, true);
  const missing = parseInvoiceLineFields({ quantity: 3 }, 1);
  assert.equal(missing.name, 'Unread line 1');
  assert.equal(missing.departmentAssumed, true);
});

test('case unit selects case quantity kind and an omitted unit stays units', () => {
  assert.equal(quantityKindForInvoiceUnit('cases'), 'cases');
  assert.equal(quantityKindForInvoiceUnit('CS'), 'cases');
  assert.equal(quantityKindForInvoiceUnit(undefined, 'units'), 'units');
  assert.equal(quantityKindForInvoiceUnit('lbs'), 'units');
});

test('a blank vendor or invoice number cannot commit', () => {
  const gate = gateStoredOcrDraft({
    expiresAt: new Date(Date.now() + 60_000),
    payload: { vendorName: ' ', invoiceNumber: 'INV-9' },
  });
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.equal(gate.status, 409);
});

test('only the ledger idempotency key is treated as a replay', () => {
  assert.equal(isLedgerIdempotencyConflict({ code: 'P2002', meta: { target: ['key'] } }), true);
  assert.equal(
    isLedgerIdempotencyConflict({ code: 'P2002', meta: { target: ['barcode'] } }),
    false
  );
  assert.equal(isLedgerIdempotencyConflict({ code: 'P2003' }), false);
});

test('kitchen inbox counts a rescue once and ignores production consumption', () => {
  const totals = kitchenInboxReceiptQty([
    { productId: 'apple', qtyChange: -4 },
    { productId: 'apple', qtyChange: 4 },
    { productId: 'apple', qtyChange: -3 },
  ]);
  assert.equal(totals.get('apple'), 4);
});
