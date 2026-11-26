import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '@/lib/db/prisma';
import {
  recordPurchaseOrderOpen,
  submitPurchaseOrder,
  type PurchaseOrderOpenDraft,
} from '@/lib/domains/orders/purchaseOrderEmailStore';
import { PURCHASE_ORDER_RECIPIENT_REQUIRED } from '@/lib/domains/orders/purchaseOrderSubmit';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

test('marking an order sent without a recipient is rejected', async () => {
  const result = await submitPurchaseOrder({
    supplierId: 'supplier-1',
    supplierName: 'Farm',
    toEmail: '   ',
    subject: 'Purchase order',
    body: '2 cases - Bananas',
    lineKey: 'lines-a',
    productIds: ['banana', 'banana'],
    actorId: null,
    status: 'SENT',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, PURCHASE_ORDER_RECIPIENT_REQUIRED);
});

test('an empty supplier id is rejected', async () => {
  const draft: PurchaseOrderOpenDraft = {
    supplierId: 'supplier-1',
    supplierName: 'Farm',
    toEmail: 'buyer@farm.test',
    subject: 'Purchase order',
    body: '2 cases - Bananas',
    lineKey: 'lines-a',
    actorId: null,
  };
  await assert.rejects(() => recordPurchaseOrderOpen({ ...draft, supplierId: '' }, false), /supplierId is required/);
  await assert.rejects(
    () => recordPurchaseOrderOpen({ ...draft, supplierId: '   ' }, false),
    /supplierId is required/
  );
});

test('a second open for the same supplier and line key is blocked until confirmed', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `po-open-${Date.now()}`;
  const supplier = await prisma.supplier.create({ data: { name: `PO Open ${stamp}` } });
  const draft: PurchaseOrderOpenDraft = {
    supplierId: supplier.id,
    supplierName: supplier.name,
    toEmail: 'edited@farm.test',
    subject: 'Purchase order',
    body: '2 cases - Bananas',
    lineKey: 'lines-a',
    actorId: 'staff-1',
  };

  t.after(async () => {
    await prisma.purchaseOrderEmail.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });

  const first = await recordPurchaseOrderOpen(draft, false);
  assert.equal(first.ok, true);
  const second = await recordPurchaseOrderOpen({ ...draft, toEmail: 'other@farm.test' }, false);
  assert.equal(second.ok, false);
  if (!second.ok && first.ok) assert.equal(second.openedAt, first.openedAt);
  assert.equal(
    await prisma.purchaseOrderEmail.count({ where: { supplierId: supplier.id, lineKey: 'lines-a' } }),
    1
  );

  const again = await recordPurchaseOrderOpen(
    { ...draft, toEmail: 'other@farm.test', body: 'changed body', subject: 'changed', actorId: 'other-staff' },
    true
  );
  assert.equal(again.ok, true);
  const row = await prisma.purchaseOrderEmail.findFirst({
    where: { supplierId: supplier.id, lineKey: 'lines-a' },
  });
  assert.equal(row?.status, 'OPENED');
  assert.equal(row?.toEmail, 'edited@farm.test');
  assert.equal(row?.body, '2 cases - Bananas');
  assert.equal(row?.subject, 'Purchase order');
  assert.equal(row?.actorId, 'staff-1');
  assert.equal(row?.createdAt.toISOString(), first.ok ? first.openedAt : '');
});

test('submit is idempotent on lineKey and keeps Approved then Sent', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `po-status-${Date.now()}`;
  const supplier = await prisma.supplier.create({ data: { name: `PO Status ${stamp}` } });
  const draft = {
    supplierId: supplier.id,
    supplierName: supplier.name,
    toEmail: 'buyer@farm.test',
    subject: 'Purchase order',
    body: '2 cases - Bananas',
    lineKey: 'lines-a',
    productIds: ['banana', 'banana', 'kale'],
    actorId: 'staff-1',
    status: 'APPROVED' as const,
  };

  t.after(async () => {
    await prisma.purchaseOrderEmail.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });

  const first = await submitPurchaseOrder(draft);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.status, 'APPROVED');
  assert.equal(first.duplicate, false);
  assert.deepEqual(first.productIds, ['banana', 'kale']);

  const second = await submitPurchaseOrder({ ...draft, productIds: ['banana', 'kale', 'kale'] });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.duplicate, true);
  assert.equal(second.id, first.id);
  assert.equal(second.status, 'APPROVED');
  assert.deepEqual(second.productIds, ['banana', 'kale']);
  assert.equal(await prisma.purchaseOrderEmail.count({ where: { supplierId: supplier.id, lineKey: 'lines-a' } }), 1);

  const sent = await submitPurchaseOrder({ ...draft, status: 'SENT' });
  assert.equal(sent.ok, true);
  if (!sent.ok) return;
  assert.equal(sent.id, first.id);
  assert.equal(sent.status, 'SENT');
  const stored = await prisma.purchaseOrderEmail.findFirst({
    where: { supplierId: supplier.id, lineKey: 'lines-a' },
  });
  assert.equal(stored?.status, 'SENT');
  assert.deepEqual(stored?.productIds, ['banana', 'kale']);

  const again = await submitPurchaseOrder({ ...draft, status: 'APPROVED', toEmail: 'other@farm.test' });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.status, 'SENT');
  assert.equal(await prisma.purchaseOrderEmail.count({ where: { supplierId: supplier.id } }), 1);
  const kept = await prisma.purchaseOrderEmail.findFirst({ where: { id: first.id } });
  assert.equal(kept?.status, 'SENT');
  assert.equal(kept?.toEmail, 'buyer@farm.test');
});
