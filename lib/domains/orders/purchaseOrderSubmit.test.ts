import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PURCHASE_ORDER_RECIPIENT_REQUIRED,
  dedupePurchaseOrderLines,
  planPurchaseOrderSubmit,
  type PurchaseOrderLineRecord,
} from '@/lib/domains/orders/purchaseOrderSubmit';

const saved: PurchaseOrderLineRecord = {
  id: 'po-1',
  status: 'APPROVED',
  productIds: ['banana', 'banana', 'kale'],
  toEmail: 'buyer@farm.test',
};

test('duplicate product ids collapse to one line', () => {
  assert.deepEqual(dedupePurchaseOrderLines([' banana ', 'banana', '', 'kale', 'kale']), ['banana', 'kale']);
});

test('a second submit is the same record and does not append lines', () => {
  const first = planPurchaseOrderSubmit({
    requested: 'APPROVED',
    toEmail: 'buyer@farm.test',
    productIds: ['banana', 'banana', 'kale'],
    existing: null,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.decision.duplicate, false);
  assert.deepEqual(first.decision.productIds, ['banana', 'kale']);
  assert.equal(first.decision.status, 'APPROVED');

  const second = planPurchaseOrderSubmit({
    requested: 'APPROVED',
    toEmail: 'buyer@farm.test',
    productIds: ['banana', 'kale', 'kale', 'banana'],
    existing: { ...saved, productIds: first.decision.productIds },
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.decision.duplicate, true);
  assert.equal(second.decision.status, null);
  assert.deepEqual(second.decision.productIds, ['banana', 'kale']);
});

test('sent is refused without one recipient and does not describe a write', () => {
  for (const toEmail of ['', '   ', 'buyer@farm.test, other@farm.test', 'not-an-email']) {
    const plan = planPurchaseOrderSubmit({
      requested: 'SENT',
      toEmail,
      productIds: ['banana', 'banana'],
      existing: saved,
    });
    assert.equal(plan.ok, false);
    if (!plan.ok) assert.equal(plan.error, PURCHASE_ORDER_RECIPIENT_REQUIRED);
  }
});

test('approved stays approved, sent stays sent, and sent is not downgraded', () => {
  const approvedAgain = planPurchaseOrderSubmit({
    requested: 'APPROVED',
    toEmail: 'buyer@farm.test',
    productIds: ['banana', 'kale'],
    existing: { ...saved, productIds: ['banana', 'kale'] },
  });
  assert.equal(approvedAgain.ok, true);
  if (!approvedAgain.ok) return;
  assert.equal(approvedAgain.decision.status, null);
  assert.equal(approvedAgain.decision.duplicate, true);

  const sent = planPurchaseOrderSubmit({
    requested: 'SENT',
    toEmail: 'buyer@farm.test',
    productIds: ['banana', 'kale'],
    existing: { ...saved, productIds: ['banana', 'kale'] },
  });
  assert.equal(sent.ok, true);
  if (!sent.ok) return;
  assert.equal(sent.decision.status, 'SENT');
  assert.deepEqual(sent.decision.productIds, ['banana', 'kale']);

  const sentAgain = planPurchaseOrderSubmit({
    requested: 'SENT',
    toEmail: 'buyer@farm.test',
    productIds: ['banana', 'kale', 'kale'],
    existing: { id: 'po-1', status: 'SENT', productIds: ['banana', 'kale'], toEmail: 'buyer@farm.test' },
  });
  assert.equal(sentAgain.ok, true);
  if (!sentAgain.ok) return;
  assert.equal(sentAgain.decision.status, null);
  assert.deepEqual(sentAgain.decision.productIds, ['banana', 'kale']);

  const downgrade = planPurchaseOrderSubmit({
    requested: 'APPROVED',
    toEmail: 'other@farm.test',
    productIds: ['banana', 'kale'],
    existing: { id: 'po-1', status: 'SENT', productIds: ['banana', 'kale'], toEmail: 'buyer@farm.test' },
  });
  assert.equal(downgrade.ok, true);
  if (!downgrade.ok) return;
  assert.equal(downgrade.decision.status, null);
  assert.equal(downgrade.decision.duplicate, true);
});
