import assert from 'node:assert/strict';
import test from 'node:test';
import { acknowledgePurchaseOrderDraft } from '@/components/features/orders/supplierMail';

test('preparing a purchase order does not deliver it', () => {
  const result = acknowledgePurchaseOrderDraft();
  assert.equal(result.markSent, false);
  assert.equal(result.notice, 'Draft prepared');
  assert.equal(/\bsent\b/i.test(result.notice), false);
});
