import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '@/lib/domains/inventory/ledger';
import { buildAuthoritativeOcrDraft } from '@/lib/domains/receiving/invoiceOcrDraft';
import { saveInvoiceOcrDraft } from '@/lib/domains/receiving/invoiceOcrCommit';
import { postReceipt } from '@/lib/domains/inventory/stock';
import { commitConfirmedVoiceItems } from '@/lib/domains/inventory/voiceCommit';
import { settleStoredOcrDraft } from '@/lib/domains/receiving/invoiceOcrSettle';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

function mixedDraft() {
  return buildAuthoritativeOcrDraft({
    vendorName: 'North Market',
    invoiceNumber: 'INV-100',
    invoiceDate: '2026-11-08',
    totalAmount: 10,
    departmentBreakdown: { PRODUCE: 10 },
    lines: [
      {
        item_name: 'Apples',
        product_id: '',
        quantity: 2,
        unit: 'cases',
        unit_cost: 5,
        department: 'PRODUCE',
        case_pack_size: 4,
        line_confidence: 0.99,
        requires_approval: false,
      },
      {
        item_name: 'Unread line 2',
        product_id: null,
        quantity: 0,
        unit: 'cases',
        unit_cost: 4,
        department: 'PRODUCE',
        case_pack_size: 1,
        line_confidence: 0.99,
        requires_approval: false,
        quantity_unreadable: true,
        department_assumed: true,
      },
    ],
  });
}

test('mixed OCR draft commit writes nothing until gaps are resolved', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `ocr-${Date.now()}`;
  const draftPayload = mixedDraft();
  draftPayload.invoiceNumber = `INV-${stamp}`;
  const draft = await saveInvoiceOcrDraft(`staff-${stamp}`, draftPayload);
  t.after(async () => {
    await prisma.invoiceOcrDraft.deleteMany({ where: { id: draft.id } });
    await prisma.ledgerIdempotencyKey.deleteMany({
      where: { key: { contains: stamp } },
    });
    const products = await prisma.product.findMany({
      where: { name: { contains: stamp } },
      select: { id: true },
    });
    const ids = products.map((row) => row.id);
    if (ids.length > 0) {
      await prisma.inventoryLot.deleteMany({ where: { productId: { in: ids } } });
      await prisma.inventoryTransaction.deleteMany({ where: { productId: { in: ids } } });
      await prisma.invoiceLineItem.deleteMany({ where: { name: { contains: stamp } } });
    }
    await prisma.vendorInvoice.deleteMany({ where: { invoiceNumber: { contains: stamp } } });
    await prisma.product.deleteMany({ where: { name: { contains: stamp } } });
  });

  const clerk = await settleStoredOcrDraft({
    draftId: draft.id,
    staffId: `staff-${stamp}`,
    actorIsManager: false,
    manualReviewOverride: true,
    post: true,
    resolutions: {
      lines: [{ index: 1, line_name: `Lemons ${stamp}`, quantity: 1, department: 'PRODUCE' }],
    },
  });
  assert.equal(clerk.kind, 'blocked');
  assert.equal(await prisma.vendorInvoice.count({ where: { invoiceNumber: draftPayload.invoiceNumber } }), 0);
  assert.equal(await prisma.ledgerIdempotencyKey.count({ where: { key: { contains: stamp } } }), 0);
  const saved = await prisma.invoiceOcrDraft.findUnique({ where: { id: draft.id } });
  const savedPayload = saved?.payload as unknown as typeof draftPayload;
  assert.equal(savedPayload.lines[1]?.delivery_id, draftPayload.lines[1]?.delivery_id);
  assert.equal(savedPayload.lines[1]?.department_assumed, true);
  assert.equal(saved?.consumedAt, null);

  const manager = await settleStoredOcrDraft({
    draftId: draft.id,
    staffId: `manager-${stamp}`,
    actorIsManager: true,
    manualReviewOverride: true,
    post: true,
    resolutions: { lines: [{ index: 1, department: 'PRODUCE' }] },
  });
  assert.equal(manager.kind, 'posted');
  if (manager.kind === 'posted') assert.equal(manager.result.transactionsCreated, 2);
  const lineKey = `recv:${draftPayload.lines[0]?.delivery_id}`;
  assert.equal(await prisma.inventoryTransaction.count({ where: { referenceId: lineKey } }), 1);
});

test('distinct vendor and punctuation do not replay as the same receipt', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `id-${Date.now()}`;
  const item = {
    name: `Apples ${stamp}`,
    department: 'PRODUCE' as const,
    quantity: 1,
    unit: 'cases',
    casePackSize: 2,
    subUnit: 'units',
    unitCost: 3,
    totalCost: 3,
  };
  const a = `11111111-1111-4111-8111-${String(Date.now()).slice(-12)}`;
  const b = `22222222-2222-4222-8222-${String(Date.now()).slice(-12)}`;
  assert.notEqual(a, b);

  t.after(async () => {
    await prisma.ledgerIdempotencyKey.deleteMany({ where: { key: { in: [`recv:${a}`, `recv:${b}`] } } });
    const products = await prisma.product.findMany({
      where: { name: { contains: stamp } },
      select: { id: true },
    });
    const ids = products.map((row) => row.id);
    if (ids.length) {
      await prisma.inventoryLot.deleteMany({ where: { productId: { in: ids } } });
      await prisma.inventoryTransaction.deleteMany({ where: { productId: { in: ids } } });
      await prisma.product.deleteMany({ where: { id: { in: ids } } });
    }
  });

  const first = await postReceipt({
    itemName: item.name,
    casesReceived: 1,
    caseCost: 3,
    packSize: 2,
    splitFactor: 1,
    retailPrice: 2,
    staffId: 'staff-id',
    externalLogId: a,
  });
  const second = await postReceipt({
    itemName: item.name,
    casesReceived: 1,
    caseCost: 3,
    packSize: 2,
    splitFactor: 1,
    retailPrice: 2,
    staffId: 'staff-id',
    externalLogId: b,
  });
  assert.equal(first.posted, true);
  assert.equal(second.posted, true);
  if (first.posted && second.posted) {
    assert.equal(first.idempotent, undefined);
    assert.equal(second.idempotent, undefined);
    assert.notEqual(first.transactionId, second.transactionId);
  }
});

test('concurrent voice commits write one movement and one voice log', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `voice-${Date.now()}`;
  const product = await prisma.product.create({
    data: {
      name: `Voice Apple ${stamp}`,
      department: 'PRODUCE',
      standardCost: 1,
      retailPrice: 2,
      shelfLifeDays: 4,
    },
  });
  t.after(async () => {
    await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.ledgerIdempotencyKey.deleteMany({ where: { key: { contains: stamp } } });
    await prisma.voiceLog.deleteMany({ where: { transcript: { contains: stamp } } });
    await prisma.product.delete({ where: { id: product.id } });
  });
  await postReceipt({
    itemName: product.name,
    productId: product.id,
    casesReceived: 5,
    caseCost: 1,
    packSize: 1,
    splitFactor: 1,
    retailPrice: 2,
    staffId: 'staff-voice',
    externalLogId: `seed-${stamp}`,
  });
  const mutation = `voice-${stamp}`;
  const [first, second] = await Promise.all([
    commitConfirmedVoiceItems({
      actorId: 'staff-voice',
      clientMutationId: mutation,
      transcript: `voice ${stamp}`,
      confirmedItems: [{ product_id: product.id, quantity: 1, target_action: 'PULL_RESCUE' }],
    }),
    commitConfirmedVoiceItems({
      actorId: 'staff-voice',
      clientMutationId: mutation,
      transcript: `voice ${stamp}`,
      confirmedItems: [{ product_id: product.id, quantity: 1, target_action: 'PULL_RESCUE' }],
    }),
  ]);
  const created = [first, second].map((row) => row.transactionsCreated).sort();
  assert.deepEqual(created, [0, 2]);
  const logs = await prisma.voiceLog.count({ where: { transcript: { contains: stamp } } });
  assert.equal(logs, 1);
  const rescueIn = await prisma.inventoryTransaction.count({
    where: {
      productId: product.id,
      transactionType: 'Rescue',
      qtyChange: { gt: 0 },
    },
  });
  assert.equal(rescueIn, 1);
});

test('same delivery id with a different cost conflicts and does not add stock', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `fp-${Date.now()}`;
  const id = `33333333-3333-4333-8333-${String(Date.now()).slice(-12)}`;
  t.after(async () => {
    await prisma.ledgerIdempotencyKey.deleteMany({ where: { key: `recv:${id}` } });
    const products = await prisma.product.findMany({ where: { name: { contains: stamp } }, select: { id: true } });
    const ids = products.map((row) => row.id);
    if (ids.length) {
      await prisma.inventoryLot.deleteMany({ where: { productId: { in: ids } } });
      await prisma.inventoryTransaction.deleteMany({ where: { productId: { in: ids } } });
      await prisma.product.deleteMany({ where: { id: { in: ids } } });
    }
  });
  const first = await postReceipt({
    itemName: `Pear ${stamp}`,
    casesReceived: 2,
    caseCost: 10,
    packSize: 4,
    splitFactor: 1,
    retailPrice: 3,
    supplier: 'North',
    staffId: 'staff',
    externalLogId: id,
  });
  const second = await postReceipt({
    itemName: `Pear ${stamp}`,
    casesReceived: 2,
    caseCost: 11,
    packSize: 4,
    splitFactor: 1,
    retailPrice: 3,
    supplier: 'North',
    staffId: 'staff',
    externalLogId: id,
  });
  assert.equal(first.posted, true);
  assert.equal(second.posted, false);
  if (first.posted) {
    const rows = await prisma.inventoryTransaction.count({ where: { productId: first.productId, transactionType: 'Receive' } });
    assert.equal(rows, 1);
  }
});

test('concurrent resolutions of one draft post one stock commit', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `race-draft-${Date.now()}`;
  const payload = buildAuthoritativeOcrDraft({
    vendorName: `Race ${stamp}`,
    invoiceNumber: `INV-A-${stamp}`,
    invoiceDate: '2026-11-08',
    totalAmount: 4,
    departmentBreakdown: { PRODUCE: 4 },
    lines: [
      {
        item_name: `Race Apple ${stamp}`,
        product_id: '',
        quantity: 1,
        unit: 'cases',
        unit_cost: 4,
        department: 'PRODUCE',
        case_pack_size: 2,
        line_confidence: 0.99,
        requires_approval: false,
      },
    ],
  });
  const draft = await saveInvoiceOcrDraft('staff-race', payload);
  t.after(async () => {
    await prisma.invoiceLineItem.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.vendorInvoice.deleteMany({ where: { vendorName: { contains: stamp } } });
    await prisma.ledgerIdempotencyKey.deleteMany({ where: { key: { contains: draft.id } } });
    const deliveryId = payload.lines[0]?.delivery_id;
    if (deliveryId) {
      await prisma.ledgerIdempotencyKey.deleteMany({ where: { key: `recv:${deliveryId}` } });
      await prisma.inventoryLot.deleteMany({ where: { receiveReferenceId: `recv:${deliveryId}` } });
      await prisma.inventoryTransaction.deleteMany({ where: { referenceId: `recv:${deliveryId}` } });
    }
    await prisma.product.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.invoiceOcrDraft.deleteMany({ where: { id: draft.id } });
  });
  const [left, right] = await Promise.all([
    settleStoredOcrDraft({
      draftId: draft.id,
      staffId: 'staff-a',
      actorIsManager: true,
      manualReviewOverride: true,
      post: true,
      resolutions: { invoiceNumber: `INV-A-${stamp}` },
    }),
    settleStoredOcrDraft({
      draftId: draft.id,
      staffId: 'staff-b',
      actorIsManager: true,
      manualReviewOverride: true,
      post: true,
      resolutions: { invoiceNumber: `INV-B-${stamp}` },
    }),
  ]);
  const kinds = [left.kind, right.kind].sort();
  assert.deepEqual(kinds, ['conflict', 'posted']);
  const invoices = await prisma.vendorInvoice.count({ where: { vendorName: { contains: stamp } } });
  assert.equal(invoices, 1);
  const deliveryId = payload.lines[0]?.delivery_id ?? '';
  assert.equal(
    await prisma.inventoryTransaction.count({ where: { referenceId: `recv:${deliveryId}` } }),
    1
  );
});
