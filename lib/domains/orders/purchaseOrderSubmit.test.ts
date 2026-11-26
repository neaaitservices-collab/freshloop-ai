import assert from 'node:assert/strict';
import test from 'node:test';
import { purchaseOrderLineKey } from '@/components/features/orders/supplierMail';
import { marksFromPurchaseOrders } from '@/components/features/orders/supplierMail';
import {
  PURCHASE_ORDER_RECIPIENT_REQUIRED,
  applyPurchaseOrderHistoryLoad,
  coveredApprovedOrderIds,
  dedupeSupplierIds,
  dedupePurchaseOrderLines,
  planPurchaseOrderSubmit,
  trimCoveredPurchaseOrder,
  type PurchaseOrderHistoryEntry,
  type PurchaseOrderLineRecord,
} from '@/lib/domains/orders/purchaseOrderSubmit';

const saved: PurchaseOrderLineRecord = {
  id: 'po-1',
  status: 'APPROVED',
  productIds: ['banana', 'banana', 'kale'],
  toEmail: 'buyer@farm.test',
};

test('duplicate supplier ids collapse', () => {
  assert.deepEqual(dedupeSupplierIds(['  sup-1 ', 'sup-1', '', 'sup-2', 'sup-2']), ['sup-1', 'sup-2']);
});

test('a group send covers the approved rows for those products', () => {
  const ids = coveredApprovedOrderIds(
    [
      { id: 'a', status: 'APPROVED', productIds: ['A'] },
      { id: 'b', status: 'APPROVED', productIds: ['B', 'B'] },
      { id: 'c', status: 'APPROVED', productIds: ['C'] },
      { id: 'sent', status: 'SENT', productIds: ['A'] },
      { id: 'empty', status: 'APPROVED', productIds: [] },
    ],
    ['A', 'B', 'A']
  );
  assert.deepEqual(ids, ['a', 'b']);
});

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

test('a failed history load keeps sent marks', () => {
  const current: PurchaseOrderHistoryEntry[] = [
    {
      id: 'po-a',
      supplierId: 'sup-1',
      supplierName: 'Farm',
      toEmail: 'buyer@farm.test',
      subject: 'PO',
      status: 'SENT',
      lineKey: 'a',
      productIds: ['A'],
      createdAt: '2026-11-20T00:00:00.000Z',
      updatedAt: '2026-11-20T00:00:00.000Z',
      open: true,
    },
  ];
  const kept = applyPurchaseOrderHistoryLoad(current, { ok: false });
  assert.equal(marksFromPurchaseOrders(kept).A, 'sent');
  const replaced = applyPurchaseOrderHistoryLoad(current, { ok: true, orders: [] });
  assert.equal(marksFromPurchaseOrders(replaced).A, undefined);
});

test('trimming a partial send rebuilds the line key and body', () => {
  const trimmed = trimCoveredPurchaseOrder({
    supplier: 'Farm',
    productIds: ['A', 'C'],
    body: '1 case - A\tA\n1 case - C\tC',
    sentProductIds: ['A'],
  });
  assert.ok(trimmed);
  assert.deepEqual(trimmed?.productIds, ['C']);
  assert.equal(trimmed?.body, '1 case - C\tC');
  assert.equal(
    trimmed?.lineKey,
    purchaseOrderLineKey({ supplier: 'Farm', productIds: ['C'], body: '1 case - C\tC' })
  );
  assert.equal(
    trimCoveredPurchaseOrder({
      supplier: 'Farm',
      productIds: ['C', 'A'],
      body: '1 case - A\tA\n1 case - C\tC',
      sentProductIds: ['A'],
    })?.body,
    '1 case - C\tC'
  );
  assert.equal(
    trimCoveredPurchaseOrder({
      supplier: 'Farm',
      productIds: ['A', 'C'],
      body: '1 case - A\tA\n1 case - C\tC',
      sentProductIds: ['A', 'C'],
    }),
    null
  );
});
