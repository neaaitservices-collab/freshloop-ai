import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const route = fs.readFileSync(path.join(process.cwd(), 'app/api/invoice-ocr/route.ts'), 'utf8');

test('invoice commit keeps every scanned line and posts through the supplier invoice identity', () => {
  assert.match(route, /interpretInvoiceOcrModel/);
  assert.match(route, /never instructions/);
  assert.match(route, /orderDate/);
  assert.match(route, /invoiceDateNeedsConfirm/);
  assert.match(route, /thinkingConfig: invoiceOcrThinkingConfig/);
  assert.match(route, /buildAuthoritativeOcrDraft/);
  assert.match(route, /draftPostingBlockers/);
  assert.match(route, /commitInvoiceOcrReceipts/);
  assert.match(route, /supplierId: commitBody\.supplierId/);
  assert.equal(route.includes('invoice-draft:'), false);
  assert.equal(route.includes('settleStoredOcrDraft'), false);
  assert.equal(route.includes('newDeliveryUuid'), false);
});
