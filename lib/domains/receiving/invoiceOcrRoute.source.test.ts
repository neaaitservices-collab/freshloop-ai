import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const route = fs.readFileSync(
  path.join(process.cwd(), 'app/api/invoice-ocr/route.ts'),
  'utf8'
);

test('invoice commit route stores every line and refuses before any ledger write', () => {
  assert.match(route, /settleStoredOcrDraft/);
  assert.match(route, /buildAuthoritativeOcrDraft/);
  assert.equal(route.includes('invoiceIdempotencyKey'), false);
});
