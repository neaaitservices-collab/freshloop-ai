import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  CLERK_MANAGER_REASON,
  clerkCannotConfirm,
  clerkManagerReviewCopy,
  invoiceRequestErrorMessage,
  lineBlockerNeedsManager,
  managerApprovalLabel,
  needsManagerSignoff,
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
  assert.equal(clerkCannotConfirm({ manager: false, reviewFlags: [], lines: [priceJump], blockers }), true);
  assert.equal(clerkCannotConfirm({ manager: true, reviewFlags: [], lines: [priceJump], blockers }), false);
  assert.equal(
    clerkCannotConfirm({
      manager: false,
      reviewFlags: [],
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
  assert.equal(needsManagerSignoff({ reviewFlags: [], lines: [], blockers: [pack] }), false);
  assert.equal(clerkCannotConfirm({ manager: false, reviewFlags: [], lines: [], blockers: [pack] }), true);
  assert.equal(needsManagerSignoff({ reviewFlags: [], lines: [fuzzy], blockers: [] }), false);
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
  assert.match(sheet, /invoiceRequestErrorMessage\(response\.status, json\)/);
  assert.match(sheet, /manualReviewOverride: true/);
  assert.match(sheet, /matchSupplierByName\(view\.vendorName, suppliers\)/);
  assert.match(sheet, /status === 'none'/);
  assert.match(sheet, /addOcrSupplierLabel\(view\.vendorName\)/);
  assert.match(sheet, /\/api\/receiving-suppliers/);
  assert.match(sheet, /JSON\.stringify\(\{ name: printedSupplierName\(view\.vendorName\) \}\)/);
  assert.match(sheet, /setSupplierId\(json\.supplier\.id\)/);
  assert.match(sheet, /onSupplierCreated\?\.\(json\.supplier\)/);
  assert.match(screen, /onSupplierCreated=\{rememberSupplier\}/);
  assert.equal(sheet.includes('kitchen'), false);
  assert.equal(screen.slice(screen.indexOf('function ReceiveScreen')).includes('kitchen'), false);
});
