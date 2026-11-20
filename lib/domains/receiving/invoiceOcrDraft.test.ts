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

test('an unmatched line does not block, and a low extraction confidence still does', () => {
  const draft = draftFrom([
    source({ item_name: 'Unknown greens', product_id: null, line_confidence: 0.96 }),
    source({ item_name: 'Apples', product_id: 'apples', line_confidence: 0.4, requires_approval: true }),
  ]);
  const blockers = draftPostingBlockers(draft, { actorIsManager: false, manualReviewOverride: false });
  assert.equal(blockers.some((line) => /not matched/.test(line)), false);
  assert.match(blockers.join(' '), /Line 2 is unresolved/);
  const overridden = draftPostingBlockers(draft, { actorIsManager: true, manualReviewOverride: true });
  assert.equal(overridden.some((line) => line.startsWith('Line 2 is unresolved')), false);
  const unreadable = draftFrom([
    source({ item_name: 'Unread line 1', product_id: null, quantity: 0, line_confidence: 0.2 }),
  ]);
  assert.match(
    draftPostingBlockers(unreadable, { actorIsManager: true, manualReviewOverride: true }).join(' '),
    /Line 1 is unresolved/
  );
});

test('manager approval clears cost_guardrail, including a stale scan list, and a clerk override does not', () => {
  const draft = draftFrom([
    source({ item_name: 'Bananas', requires_approval: true, line_confidence: 0.99 }),
    source({ item_name: 'Unread line 2', product_id: null, quantity: 0, line_confidence: 0.99 }),
  ]);
  assert.match(
    draftPostingBlockers(draft, { actorIsManager: true, manualReviewOverride: false }).join(' '),
    /Line 1 is unresolved \(cost_guardrail\)/
  );
  const manager = draftPostingBlockers(draft, { actorIsManager: true, manualReviewOverride: true });
  assert.equal(manager.some((row) => /cost_guardrail/.test(row)), false);
  assert.match(manager.join(' '), /Line 2 is unresolved/);
  assert.match(
    draftPostingBlockers(draft, { actorIsManager: false, manualReviewOverride: true }).join(' '),
    /cost_guardrail/
  );

  const stale = {
    ...draftFrom([source({ line_confidence: 0.99, requires_approval: false })]),
    pageScanBlockers: [
      'Line 8 is unresolved (cost_guardrail).',
      'Line 17 is unresolved (cost_guardrail, low_confidence).',
      'Line 38 is unresolved (quantity_unreadable).',
    ],
  };
  const cleared = draftPostingBlockers(stale, { actorIsManager: true, manualReviewOverride: true });
  assert.equal(cleared.includes('Line 8 is unresolved (cost_guardrail).'), false);
  assert.equal(cleared.includes('Line 17 is unresolved (low_confidence).'), true);
  assert.equal(cleared.includes('Line 38 is unresolved (quantity_unreadable).'), true);
  const clerk = draftPostingBlockers(stale, { actorIsManager: false, manualReviewOverride: true });
  assert.equal(clerk.includes('Line 8 is unresolved (cost_guardrail).'), true);
  const unchecked = draftPostingBlockers(stale, { actorIsManager: true, manualReviewOverride: false });
  assert.equal(unchecked.includes('Line 8 is unresolved (cost_guardrail).'), true);
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
