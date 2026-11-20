import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OcrSupplierCreateButton } from '@/components/features/receive/OcrSupplierCreateButton';
import {
  CLERK_MANAGER_REASON,
  clerkCannotConfirm,
  clerkManagerReviewCopy,
  invoiceRequestErrorMessage,
  lineBlockerNeedsManager,
  managerApprovalLabel,
  needsManagerSignoff,
  reviewBlockersAfterApproval,
  showManagerOverride,
} from '@/lib/domains/receiving/receiveReviewGate';

const priceJump = { name: 'Bananas', requiresApproval: true };
const fuzzy = { name: 'Mango', fuzzyAmbiguous: true, requiresApproval: false };

test('the manager checkbox shows for a price jump even when reviewFlags is empty', () => {
  assert.equal(
    showManagerOverride({ manager: true, reviewFlags: [], lines: [priceJump] }),
    true
  );
  assert.equal(showManagerOverride({ manager: false, reviewFlags: [], lines: [priceJump] }), false);
  assert.equal(
    showManagerOverride({ manager: true, reviewFlags: ['Invoice subtotal 10.00 does not match the line sum 8.00.'], lines: [] }),
    true
  );
  assert.equal(showManagerOverride({ manager: true, reviewFlags: [], lines: [fuzzy] }), true);
  assert.equal(showManagerOverride({ manager: true, reviewFlags: [], lines: [{ name: 'Ok' }] }), false);
  assert.equal(
    showManagerOverride({
      manager: true,
      reviewFlags: [],
      lines: [],
      blockers: ['Line 1 is unresolved (low_confidence).'],
    }),
    true
  );
  assert.match(managerApprovalLabel({ lines: [priceJump, priceJump] }), /Manager approval: 2 line\(s\) exceed ±20%/);
  assert.equal(managerApprovalLabel({ lines: [] }), 'I reviewed the flagged lines and totals');
});

test('a clerk cannot confirm a price jump, and the 409 reason stays visible', () => {
  const blockers = ['Line 1 is unresolved (cost_guardrail).'];
  assert.equal(clerkCannotConfirm({ manager: false, lines: [priceJump], blockers }), true);
  assert.equal(clerkCannotConfirm({ manager: true, lines: [priceJump], blockers }), false);
  assert.equal(
    clerkCannotConfirm({
      manager: false,
      lines: [],
      blockers: ['Line 2 is unresolved (low_confidence).'],
    }),
    true
  );
  assert.equal(
    lineBlockerNeedsManager('Line 3 pack is 10 and split is 2. A manager must confirm a pack change.'),
    true
  );
  assert.equal(lineBlockerNeedsManager('Line 4 is unresolved (quantity_unreadable).'), false);
  const pack = 'Line 3 pack is 10 and split is 2. A manager must confirm a pack change.';
  assert.equal(needsManagerSignoff({ lines: [], blockers: [pack] }), false);
  assert.equal(clerkCannotConfirm({ manager: false, lines: [], blockers: [pack] }), true);
  assert.equal(needsManagerSignoff({ lines: [fuzzy], blockers: [] }), false);
  assert.match(clerkManagerReviewCopy({ lines: [priceJump], blockers }), /\(cost guardrail\)/);
  assert.equal(CLERK_MANAGER_REASON.includes('kitchen'), false);
  assert.equal(
    invoiceRequestErrorMessage(409, {
      error: 'The invoice could not be read.',
      blockers,
    }),
    blockers[0]
  );
  assert.equal(
    invoiceRequestErrorMessage(409, {
      blockers: ['Line 1 is unresolved (cost_guardrail).', 'Line 2 is unresolved (low_confidence).'],
    }),
    'Line 1 is unresolved (cost_guardrail). Line 2 is unresolved (low_confidence).'
  );
});

const subtotalFlag = 'Invoice subtotal 10.00 does not match the line sum 8.00.';

test('a checked manager approval clears cost_guardrail and leaves every other blocker', () => {
  const blockers = [
    'Line 8 is unresolved (cost_guardrail).',
    'Line 17 is unresolved (cost_guardrail, low_confidence).',
    'Line 38 is unresolved (quantity_unreadable).',
    'Line 41 is unresolved (cost_guardrail).',
    'Pages do not agree on the invoice date. Pick the date from the paper.',
  ];
  assert.deepEqual(reviewBlockersAfterApproval({ manager: true, approved: true, blockers }), [
    'Line 17 is unresolved (low_confidence).',
    'Line 38 is unresolved (quantity_unreadable).',
    'Pages do not agree on the invoice date. Pick the date from the paper.',
  ]);
  assert.deepEqual(reviewBlockersAfterApproval({ manager: true, approved: false, blockers }), blockers);
  assert.deepEqual(reviewBlockersAfterApproval({ manager: false, approved: true, blockers }), blockers);
});

test('a receiver with only a subtotal flag can confirm', () => {
  const reviewFlags = [subtotalFlag];
  assert.equal(showManagerOverride({ manager: true, reviewFlags, lines: [] }), true);
  assert.equal(showManagerOverride({ manager: false, reviewFlags, lines: [] }), false);
  assert.equal(needsManagerSignoff({ lines: [], blockers: [] }), false);
  assert.equal(needsManagerSignoff({ lines: [], blockers: [subtotalFlag] }), false);
  assert.equal(clerkCannotConfirm({ manager: false, lines: [], blockers: [subtotalFlag] }), false);
  assert.equal(
    clerkCannotConfirm({
      manager: false,
      lines: [{ requiresApproval: false }],
      blockers: [subtotalFlag],
    }),
    false
  );
});

test('an unmatched printed vendor renders the new-supplier button', () => {
  const unmatched = renderToStaticMarkup(
    createElement(OcrSupplierCreateButton, {
      vendorName: 'Northwind Baking',
      suppliers: [{ id: 'sup-1', name: 'Acme Foods' }],
      creating: false,
      onCreate: () => {},
    })
  );
  assert.match(unmatched, /Add (&quot;|")Northwind Baking(&quot;|") as new supplier/);
  assert.equal(unmatched.includes('<button'), true);
  assert.equal(/\bkitchen\b/i.test(unmatched), false);

  const matched = renderToStaticMarkup(
    createElement(OcrSupplierCreateButton, {
      vendorName: 'Acme Foods',
      suppliers: [{ id: 'sup-1', name: 'Acme Foods' }],
      creating: false,
      onCreate: () => {},
    })
  );
  assert.equal(matched, '');

  const blank = renderToStaticMarkup(
    createElement(OcrSupplierCreateButton, {
      vendorName: '   ',
      suppliers: [],
      creating: false,
      onCreate: () => {},
    })
  );
  assert.equal(blank, '');
});

test('the receive sheet wires the override checkbox and the new-supplier button', () => {
  const sheet = fs.readFileSync(
    path.join(process.cwd(), 'components/features/receive/InvoicePageScanSheet.tsx'),
    'utf8'
  );
  const screen = fs.readFileSync(
    path.join(process.cwd(), 'components/features/receive/ReceiveScreen.tsx'),
    'utf8'
  );
  assert.match(sheet, /showManagerOverride\(\{/);
  assert.match(sheet, /showOverride && signoff && !managerApproved/);
  assert.match(sheet, /clerkCannotConfirm\(\{/);
  assert.match(sheet, /managerApprovalLabel\(\{/);
  assert.match(sheet, /lineBlockerNeedsManager\(blocker\)/);
  assert.match(sheet, /reviewBlockersAfterApproval\(/);
  assert.match(sheet, /invoiceRequestErrorMessage\(response\.status, json\)/);
  assert.match(sheet, /manualReviewOverride: true/);
  assert.match(sheet, /<OcrSupplierCreateButton/);
  assert.match(sheet, /JSON\.stringify\(\{ name: printedSupplierName\(view\.vendorName\) \}\)/);
  assert.match(sheet, /setSupplierId\(json\.supplier\.id\)/);
  assert.match(sheet, /onSupplierCreated\?\.\(json\.supplier\)/);
  assert.match(screen, /onSupplierCreated=\{rememberSupplier\}/);
  assert.equal(sheet.includes('kitchen'), false);
  assert.equal(screen.slice(screen.indexOf('function ReceiveScreen')).includes('kitchen'), false);
});
