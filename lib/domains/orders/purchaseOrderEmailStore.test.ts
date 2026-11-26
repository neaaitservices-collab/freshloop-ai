import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '@/lib/db/prisma';
import { purchaseOrderLineKey } from '@/components/features/orders/supplierMail';
import {
  listPurchaseOrders,
  recordPurchaseOrderOpen,
  submitPurchaseOrder,
  type PurchaseOrderOpenDraft,
} from '@/lib/domains/orders/purchaseOrderEmailStore';
import {
  PURCHASE_ORDER_HISTORY_LIMIT,
  PURCHASE_ORDER_RECIPIENT_REQUIRED,
} from '@/lib/domains/orders/purchaseOrderSubmit';

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

test('approve A, approve B, then send A+B leaves no approved rows', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `po-cover-${Date.now()}`;
  const supplier = await prisma.supplier.create({ data: { name: `PO Cover ${stamp}` } });
  const base = {
    supplierId: supplier.id,
    supplierName: supplier.name,
    toEmail: 'buyer@farm.test',
    subject: 'Purchase order',
    actorId: 'staff-1',
  };

  t.after(async () => {
    await prisma.purchaseOrderEmail.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });

  const approvedA = await submitPurchaseOrder({
    ...base,
    body: '1 case - A',
    lineKey: 'line-a',
    productIds: ['A'],
    status: 'APPROVED',
  });
  const approvedB = await submitPurchaseOrder({
    ...base,
    body: '1 case - B',
    lineKey: 'line-b',
    productIds: ['B'],
    status: 'APPROVED',
  });
  assert.equal(approvedA.ok && approvedB.ok, true);

  const sent = await submitPurchaseOrder({
    ...base,
    body: '2 cases - A\n3 cases - B',
    lineKey: 'line-ab',
    productIds: ['A', 'B'],
    status: 'SENT',
  });
  assert.equal(sent.ok, true);
  if (!sent.ok) return;
  assert.equal(sent.status, 'SENT');
  assert.equal(sent.closedIds.length, 2);

  const rows = await prisma.purchaseOrderEmail.findMany({ where: { supplierId: supplier.id } });
  assert.equal(rows.filter((row) => row.status === 'APPROVED').length, 0);
  assert.equal(rows.filter((row) => row.productIds.includes('A') && row.status === 'SENT').length >= 1, true);
  assert.equal(rows.filter((row) => row.productIds.includes('B') && row.status === 'SENT').length >= 1, true);

  const edited = await submitPurchaseOrder({
    ...base,
    body: '4 cases - A',
    lineKey: 'line-a-edited',
    productIds: ['A'],
    status: 'APPROVED',
  });
  assert.equal(edited.ok, true);
  const resent = await submitPurchaseOrder({
    ...base,
    body: '5 cases - A',
    lineKey: 'line-a-resent',
    productIds: ['A'],
    status: 'SENT',
  });
  assert.equal(resent.ok, true);
  const afterEdit = await prisma.purchaseOrderEmail.findMany({
    where: { supplierId: supplier.id, productIds: { has: 'A' }, status: 'APPROVED' },
  });
  assert.equal(afterEdit.length, 0);
});

test('concurrent submits keep one sent row and do not raise a unique conflict', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `po-race-${Date.now()}`;
  const supplier = await prisma.supplier.create({ data: { name: `PO Race ${stamp}` } });
  const draft = {
    supplierId: supplier.id,
    supplierName: supplier.name,
    toEmail: 'buyer@farm.test',
    subject: 'Purchase order',
    body: '1 case - A',
    lineKey: 'line-a',
    productIds: ['A'],
    actorId: 'staff-1',
    status: 'APPROVED' as const,
  };

  t.after(async () => {
    await prisma.purchaseOrderEmail.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });

  const first = await submitPurchaseOrder(draft);
  assert.equal(first.ok, true);
  const results = await Promise.all([
    submitPurchaseOrder({ ...draft, status: 'SENT' }),
    submitPurchaseOrder({ ...draft, status: 'APPROVED', productIds: ['A', 'A'] }),
    submitPurchaseOrder({ ...draft, status: 'SENT', toEmail: 'later@farm.test' }),
  ]);
  assert.equal(results.every((result) => result.ok), true);
  const rows = await prisma.purchaseOrderEmail.findMany({
    where: { supplierId: supplier.id, lineKey: 'line-a' },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, 'SENT');
});

test('an order older than the open window starts a new cycle', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `po-window-${Date.now()}`;
  const supplier = await prisma.supplier.create({ data: { name: `PO Window ${stamp}` } });
  const draft = {
    supplierId: supplier.id,
    supplierName: supplier.name,
    toEmail: 'buyer@farm.test',
    subject: 'Purchase order',
    body: '2 cases - Bananas',
    lineKey: 'bananas',
    productIds: ['bananas'],
    actorId: 'staff-1',
    status: 'SENT' as const,
  };

  t.after(async () => {
    await prisma.purchaseOrderEmail.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });

  const sent = await submitPurchaseOrder(draft);
  assert.equal(sent.ok, true);
  if (!sent.ok) return;
  const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
  await prisma.$executeRaw`UPDATE "purchase_order_emails" SET "updated_at" = ${old}, "created_at" = ${old} WHERE "id" = ${sent.id}`;

  const approved = await submitPurchaseOrder({ ...draft, status: 'APPROVED' });
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  assert.equal(approved.status, 'APPROVED');
  assert.notEqual(approved.id, sent.id);
  const rows = await prisma.purchaseOrderEmail.count({ where: { supplierId: supplier.id, lineKey: 'bananas' } });
  assert.equal(rows, 2);
});

test('a receipt starts a new cycle and history keeps both rows', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `po-cycle-${Date.now()}`;
  const supplier = await prisma.supplier.create({ data: { name: `PO Cycle ${stamp}` } });
  const product = await prisma.product.create({
    data: { name: `Bananas ${stamp}`, department: 'PRODUCE', supplier: supplier.name, casePackSize: 6, parCases: 2 },
  });
  const draft = {
    supplierId: supplier.id,
    supplierName: supplier.name,
    toEmail: 'buyer@farm.test',
    subject: 'Purchase order',
    body: '2 cases - Bananas',
    lineKey: 'bananas',
    productIds: [product.id],
    actorId: 'staff-1',
  };

  t.after(async () => {
    await prisma.purchaseOrderEmail.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });

  const sent = await submitPurchaseOrder({ ...draft, status: 'SENT' });
  assert.equal(sent.ok, true);
  if (!sent.ok) return;

  await prisma.inventoryTransaction.create({
    data: {
      productId: product.id,
      staffId: 'test-staff',
      qtyChange: 12,
      transactionType: 'Receive',
      fromLocation: 'External_Vendor',
      toLocation: 'Retail_Floor',
      unitCostAtTime: 1.5,
      timestamp: new Date(sent.updatedAt),
    },
  });

  const approved = await submitPurchaseOrder({ ...draft, status: 'APPROVED' });
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  assert.equal(approved.status, 'APPROVED');
  assert.notEqual(approved.id, sent.id);

  const sentAgain = await submitPurchaseOrder({ ...draft, status: 'SENT' });
  assert.equal(sentAgain.ok, true);
  if (!sentAgain.ok) return;
  assert.equal(sentAgain.id, approved.id);
  assert.equal(sentAgain.status, 'SENT');
  assert.equal(sentAgain.duplicate, true);

  const repeat = await submitPurchaseOrder({ ...draft, status: 'SENT' });
  assert.equal(repeat.ok, true);
  if (!repeat.ok) return;
  assert.equal(repeat.id, sentAgain.id);

  const history = await prisma.purchaseOrderEmail.findMany({
    where: { supplierId: supplier.id, lineKey: 'bananas' },
    orderBy: { createdAt: 'asc' },
  });
  assert.equal(history.length, 2);
  assert.deepEqual(
    history.map((row) => row.status),
    ['SENT', 'SENT']
  );
  assert.notEqual(history[0]?.cycleKey, history[1]?.cycleKey);
});

test('sending one product leaves the other approved and orderable', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `po-partial-${Date.now()}`;
  const supplier = await prisma.supplier.create({ data: { name: `PO Partial ${stamp}` } });
  const base = {
    supplierId: supplier.id,
    supplierName: supplier.name,
    toEmail: 'buyer@farm.test',
    subject: 'Purchase order',
    actorId: 'staff-1',
  };

  t.after(async () => {
    await prisma.purchaseOrderEmail.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });

  const approved = await submitPurchaseOrder({
    ...base,
    body: '1 case - A\n1 case - C',
    lineKey: 'ac',
    productIds: ['A', 'C'],
    status: 'APPROVED',
  });
  assert.equal(approved.ok, true);
  if (!approved.ok) return;
  const before = await prisma.purchaseOrderEmail.findFirst({ where: { id: approved.id } });
  const sent = await submitPurchaseOrder({
    ...base,
    body: '1 case - A',
    lineKey: 'a-only',
    productIds: ['A'],
    status: 'SENT',
  });
  assert.equal(sent.ok, true);
  if (!sent.ok || !approved.ok) return;
  assert.equal(sent.closedIds.includes(approved.id), false);

  const partial = await prisma.purchaseOrderEmail.findFirst({ where: { id: approved.id } });
  assert.equal(partial?.status, 'APPROVED');
  assert.deepEqual(partial?.productIds, ['C']);
  assert.equal(partial?.body, '1 case - C');
  assert.equal(
    partial?.lineKey,
    purchaseOrderLineKey({ supplier: supplier.name, productIds: ['C'], body: '1 case - C' })
  );
  assert.equal(partial?.updatedAt.getTime(), before?.updatedAt.getTime());
  const sentRow = await prisma.purchaseOrderEmail.findFirst({ where: { id: sent.id } });
  assert.equal(sentRow?.status, 'SENT');
  assert.deepEqual(sentRow?.productIds, ['A']);
});

test('an open cycle still shows when newer rows fill the history page', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `po-page-${Date.now()}`;
  const supplier = await prisma.supplier.create({ data: { name: `PO Page ${stamp}` } });
  const openAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const newer = new Date();

  t.after(async () => {
    await prisma.purchaseOrderEmail.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });

  await prisma.purchaseOrderEmail.create({
    data: {
      supplierId: supplier.id,
      supplierName: supplier.name,
      toEmail: 'buyer@farm.test',
      fromEmail: '',
      subject: 'Open cycle',
      body: '1 case - A',
      lineKey: 'open-cycle',
      cycleKey: randomUUID(),
      productIds: ['A'],
      status: 'SENT',
    },
  });
  await prisma.purchaseOrderEmail.createMany({
    data: Array.from({ length: PURCHASE_ORDER_HISTORY_LIMIT }, (_, index) => ({
      supplierId: supplier.id,
      supplierName: supplier.name,
      toEmail: 'buyer@farm.test',
      fromEmail: '',
      subject: 'Legacy',
      body: 'legacy',
      lineKey: `legacy-${index}`,
      cycleKey: randomUUID(),
      productIds: [] as string[],
      status: 'OPENED' as const,
    })),
  });
  await prisma.$executeRaw`UPDATE "purchase_order_emails" SET "updated_at" = ${newer}, "created_at" = ${newer} WHERE "supplier_id" = ${supplier.id} AND "line_key" LIKE 'legacy-%'`;
  await prisma.$executeRaw`UPDATE "purchase_order_emails" SET "updated_at" = ${openAt}, "created_at" = ${openAt} WHERE "supplier_id" = ${supplier.id} AND "line_key" = 'open-cycle'`;

  const listed = await listPurchaseOrders([supplier.id]);
  assert.equal(listed.some((row) => row.lineKey === 'open-cycle'), true);
  const legacy = listed.filter((row) => row.lineKey.startsWith('legacy-'));
  assert.ok(legacy.length >= 2);
  assert.ok(legacy[0]!.createdAt >= legacy[1]!.createdAt);
});
