import assert from 'node:assert/strict';
import test from 'node:test';
import { selectInvoiceHeaderTotal } from '@/lib/domains/receiving/invoiceHeaderTotal';
import {
  applyOcrDraftResolutions,
  buildAuthoritativeOcrDraft,
  draftPostingBlockers,
  isZeroDollarDraftLine,
  type AuditedDraftSourceLine,
} from '@/lib/domains/receiving/invoiceOcrDraft';
import { ZERO_DOLLAR_REVIEW_REASON } from '@/lib/domains/receiving/receivingLogPost';

function source(overrides: Partial<AuditedDraftSourceLine> = {}): AuditedDraftSourceLine {
  return {
    item_name: 'Apples',
    product_id: 'apples',
    quantity: 2,
    unit: 'cases',
    unit_cost: 10,
    department: 'PRODUCE',
    case_pack_size: 1,
    line_confidence: 0.99,
    requires_approval: false,
    ...overrides,
  };
}

function draftFrom(lines: AuditedDraftSourceLine[], printedSubtotal?: number) {
  return buildAuthoritativeOcrDraft({
    vendorName: 'Tony Deodato',
    invoiceNumber: '896347',
    invoiceDate: '2026-10-15',
    totalAmount: 852.1,
    ...(printedSubtotal !== undefined ? { printedSubtotal } : {}),
    departmentBreakdown: { PRODUCE: 0 },
    lines,
  });
}

test('manual review override does not clear an unmatched line', () => {
  const draft = draftFrom([
    source({ item_name: 'Unknown greens', product_id: null, line_confidence: 0.2, requires_approval: true }),
    source({ item_name: 'Apples', product_id: 'apples', line_confidence: 0.4, requires_approval: true }),
  ]);
  const overridden = draftPostingBlockers(draft, { actorIsManager: true, manualReviewOverride: true });
  assert.match(overridden.join(' '), /Line 1 is not matched to a catalog product/);
  assert.equal(overridden.some((line) => line.startsWith('Line 2 is unresolved')), false);
  const clerk = draftPostingBlockers(draft, { actorIsManager: false, manualReviewOverride: true });
  assert.match(clerk.join(' '), /Line 1 is not matched/);
  assert.match(clerk.join(' '), /Line 2 is unresolved/);
});

test('header total uses the printed subtotal, otherwise the line sum', () => {
  assert.equal(selectInvoiceHeaderTotal({ printedSubtotal: 1536.08, lineAmounts: [1500.75] }), 1536.08);
  assert.equal(selectInvoiceHeaderTotal({ printedSubtotal: 0, lineAmounts: [10, 5.5] }), 15.5);
  assert.equal(selectInvoiceHeaderTotal({ printedSubtotal: null, lineAmounts: [852.1, 648.65] }), 1500.75);

  const printed = draftFrom(
    [source({ quantity: 1, unit_cost: 1500.75 })],
    1536.08
  );
  assert.equal(printed.totalAmount, 1536.08);
  printed.printedHst = 35.33;
  const kept = applyOcrDraftResolutions(printed, { lines: [{ index: 0, quantity: 4 }] });
  assert.equal(kept.totalAmount, 1536.08);

  const summed = draftFrom([
    source({ quantity: 1, unit_cost: 800.5 }),
    source({ item_name: 'Pears', product_id: 'pears', quantity: 1, unit_cost: 700.25 }),
  ]);
  assert.equal(summed.totalAmount, 1500.75);
});

test('a $0 line stays on the draft for review and does not block the other lines', () => {
  assert.equal(isZeroDollarDraftLine({ unit_cost: 0 }), true);
  assert.equal(isZeroDollarDraftLine({ unit_cost: 0, cost_unreadable: true }), false);
  const draft = draftFrom([
    source(),
    source({
      item_name: 'Shipped zero greens',
      product_id: null,
      quantity: 0,
      unit_cost: 0,
      line_confidence: 0.2,
    }),
  ]);
  assert.equal(draft.lines.length, 2);
  assert.equal(draft.lines[1]?.line_total_note, ZERO_DOLLAR_REVIEW_REASON);
  assert.deepEqual(draft.lines[1]?.review_reasons, []);
  const blockers = draftPostingBlockers(draft, { actorIsManager: false, manualReviewOverride: false });
  assert.equal(blockers.length, 0);
});
