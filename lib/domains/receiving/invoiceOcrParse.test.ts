import assert from 'node:assert/strict';
import test from 'node:test';
import { quantityKindForInvoiceUnit } from '@/lib/domains/receiving/invoiceOcrCommit';
import { parseInvoiceIdentity, parseInvoiceLineFields } from '@/lib/domains/receiving/invoiceOcrParse';
import { draftPostingBlockers, buildAuthoritativeOcrDraft, applyOcrDraftResolutions } from '@/lib/domains/receiving/invoiceOcrDraft';
import { isLedgerIdempotencyConflict } from '@/lib/domains/inventory/idempotencyConflict';
import { kitchenInboxReceiptQty } from '@/lib/domains/inventory/kitchenInbox';

test('missing invoice identity stays blank', () => {
  const identity = parseInvoiceIdentity({});
  assert.equal(identity.vendorName, '');
  assert.equal(identity.invoiceNumber, '');
  assert.equal(identity.invoiceDate, '');
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
  const blockers = draftPostingBlockers(
    {
      vendorName: ' ',
      invoiceNumber: 'INV-9',
      invoiceDate: '2026-11-08',
      lines: [
        {
          product_id: 'p',
          quantity: 1,
          unit_cost: 1,
          line_name: 'Apples',
          line_confidence: 0.99,
          requires_approval: false,
          review_reasons: [],
        },
      ],
    },
    { actorIsManager: true, manualReviewOverride: true }
  );
  assert.ok(blockers.some((line) => line.includes('Vendor')));
  const missingDate = draftPostingBlockers(
    {
      vendorName: 'North',
      invoiceNumber: 'INV-9',
      invoiceDate: ' ',
      lines: [
        {
          product_id: 'p',
          quantity: 1,
          unit_cost: 1,
          line_name: 'Apples',
          line_confidence: 0.99,
          requires_approval: false,
          review_reasons: [],
        },
      ],
    },
    { actorIsManager: true, manualReviewOverride: true }
  );
  assert.deepEqual(missingDate, ['Invoice date was not read.']);
});

test('mixed draft keeps the unreadable line and blocks the whole commit', () => {
  const draft = buildAuthoritativeOcrDraft({
    vendorName: 'North Market',
    invoiceNumber: 'INV-100',
    invoiceDate: '2026-11-08',
    totalAmount: 10,
    departmentBreakdown: { PRODUCE: 10 },
    lines: [
      {
        item_name: 'Apples',
        product_id: 'apple',
        quantity: 2,
        unit: 'cases',
        unit_cost: 5,
        department: 'PRODUCE',
        case_pack_size: 10,
        line_confidence: 0.99,
        requires_approval: false,
      },
      {
        item_name: 'Unread line 2',
        product_id: null,
        quantity: 0,
        unit: 'cases',
        unit_cost: 4,
        department: 'PRODUCE',
        case_pack_size: 1,
        line_confidence: 0.99,
        requires_approval: false,
        quantity_unreadable: true,
        department_assumed: true,
      },
    ],
  });
  assert.equal(draft.lines.length, 2);
  assert.ok(draft.lines[1]?.review_reasons?.includes('quantity_unreadable'));
  assert.ok(draft.lines[1]?.review_reasons?.includes('name_unreadable'));
  assert.ok(draft.lines[1]?.review_reasons?.includes('department_assumed'));
  const blocked = draftPostingBlockers(draft, { actorIsManager: true, manualReviewOverride: true });
  assert.ok(blocked.length > 0);
  const staff = applyOcrDraftResolutions(
    draft,
    { lines: [{ index: 1, line_name: 'Lemons', quantity: 3, department: 'PRODUCE' }] },
    { actorIsManager: false, manualReviewOverride: true }
  );
  assert.equal(staff.lines[1]?.line_name, 'Lemons');
  assert.equal(staff.lines[1]?.quantity, 3);
  assert.equal(staff.lines[1]?.department_assumed, true);
  assert.equal(staff.totalAmount, Number((2 * 5 + 3 * 4).toFixed(2)));
  const resolved = applyOcrDraftResolutions(
    staff,
    { lines: [{ index: 1, department: 'PRODUCE' }] },
    { actorIsManager: true, manualReviewOverride: true }
  );
  assert.equal(resolved.lines[1]?.department_assumed, false);
  const still = draftPostingBlockers(resolved, { actorIsManager: false, manualReviewOverride: false });
  assert.equal(still.length, 0);
  const assumedOnly = buildAuthoritativeOcrDraft({
    vendorName: 'North Market',
    invoiceNumber: 'INV-100',
    invoiceDate: '2026-11-08',
    totalAmount: 4,
    departmentBreakdown: { PRODUCE: 4 },
    lines: [
      {
        item_name: 'Cream',
        product_id: 'cream',
        quantity: 1,
        unit: 'cases',
        unit_cost: 4,
        department: 'PRODUCE',
        case_pack_size: 1,
        line_confidence: 0.99,
        requires_approval: false,
        department_assumed: true,
      },
    ],
  });
  assert.ok(assumedOnly.lines[0]?.review_reasons?.includes('department_assumed'));
  assert.ok(
    draftPostingBlockers(assumedOnly, { actorIsManager: false, manualReviewOverride: true }).length > 0
  );
  assert.equal(
    draftPostingBlockers(assumedOnly, { actorIsManager: true, manualReviewOverride: true }).length,
    0
  );
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
