import assert from 'node:assert/strict';
import test from 'node:test';
import { acknowledgePurchaseOrderDraft } from '@/components/features/orders/supplierMail';

test('preparing a purchase order does not claim it was sent', () => {
  const result = acknowledgePurchaseOrderDraft();
  assert.equal(result.markSent, false);
  assert.equal(result.notice, 'Draft prepared - not sent');
  assert.doesNotMatch(result.notice, /sent successfully/i);
});
