import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '@/lib/db/prisma';
import {
  claimPurchaseOrderEmail,
  markPurchaseOrderEmailFailed,
  markPurchaseOrderEmailSent,
  type PurchaseOrderEmailDraft,
} from '@/lib/domains/orders/purchaseOrderEmailStore';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

test('purchase order email claim is one row per supplier and line key', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `po-email-${Date.now()}`;
  const supplier = await prisma.supplier.create({ data: { name: `PO Mail ${stamp}` } });
  const draft = (lineKey: string): PurchaseOrderEmailDraft => ({
    supplierId: supplier.id,
    supplierName: supplier.name,
    toEmail: 'buyer@farm.test',
    fromEmail: 'orders@freshloop.test',
    replyTo: 'reply@freshloop.test',
    subject: 'Purchase order',
    body: '2 cases - Bananas',
    lineKey,
    actorId: 'staff-1',
  });

  t.after(async () => {
    await prisma.purchaseOrderEmail.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });

  const first = await claimPurchaseOrderEmail(draft('lines-a'));
  assert.equal(first.ok, true);
  const pending = await prisma.purchaseOrderEmail.findFirst({
    where: { supplierId: supplier.id, lineKey: 'lines-a' },
  });
  assert.equal(pending?.status, 'PENDING');
  assert.equal(pending?.toEmail, 'buyer@farm.test');

  const blocked = await claimPurchaseOrderEmail(draft('lines-a'));
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.status, 'PENDING');
  assert.equal(
    await prisma.purchaseOrderEmail.count({ where: { supplierId: supplier.id, lineKey: 'lines-a' } }),
    1
  );

  if (first.ok) await markPurchaseOrderEmailSent(first.id, 'provider-1');
  const sent = await claimPurchaseOrderEmail(draft('lines-a'));
  assert.equal(sent.ok, false);
  if (!sent.ok) assert.equal(sent.status, 'SENT');

  const other = await claimPurchaseOrderEmail(draft('lines-b'));
  assert.equal(other.ok, true);
  if (other.ok) {
    await markPurchaseOrderEmailFailed(other.id, 'provider down');
    const retry = await claimPurchaseOrderEmail({ ...draft('lines-b'), subject: 'Purchase order retry' });
    assert.equal(retry.ok, true);
    assert.equal(retry.ok ? retry.id : '', other.id);
    const row = await prisma.purchaseOrderEmail.findUnique({ where: { id: other.id } });
    assert.equal(row?.status, 'PENDING');
    assert.equal(row?.error, null);
    assert.equal(row?.subject, 'Purchase order retry');
  }
});
