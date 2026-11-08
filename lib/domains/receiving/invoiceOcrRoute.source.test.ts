import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const route = fs.readFileSync(
  path.join(process.cwd(), 'app/api/invoice-ocr/route.ts'),
  'utf8'
);

test('invoice commit route stores every line and refuses before any ledger write', () => {
  assert.match(route, /buildAuthoritativeOcrDraft/);
  assert.match(route, /draftPostingBlockers/);
  const blockerAt = route.indexOf('const blockers = draftPostingBlockers');
  const commitAt = route.indexOf('committed = await commitInvoiceOcrReceipts');
  assert.ok(blockerAt > 0 && commitAt > blockerAt);
  assert.equal(route.includes("!item.item_name.startsWith('Unread line ')"), false);
  assert.match(route, /name_unreadable/);
  assert.match(route, /status: 409/);
  assert.match(route, /settleCommitAnalytics/);
});
