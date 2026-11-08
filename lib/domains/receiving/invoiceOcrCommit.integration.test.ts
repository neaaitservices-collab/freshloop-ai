import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import {
  applyOcrDraftResolutions,
  buildAuthoritativeOcrDraft,
  draftPostingBlockers,
} from '@/lib/domains/receiving/invoiceOcrDraft';
import {
  commitInvoiceOcrReceipts,
  invoiceIdempotencyKey,
  saveInvoiceOcrDraft,
} from '@/lib/domains/receiving/invoiceOcrCommit';
import { postReceipt } from '@/lib/domains/inventory/stock';
import { commitConfirmedVoiceItems } from '@/lib/domains/inventory/voiceCommit';
import { stableLogId } from '@/lib/domains/receiving/receivingBridge';

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

  const blocked = draftPostingBlockers(draftPayload, {
    actorIsManager: true,
    manualReviewOverride: true,
  });
  assert.ok(blocked.length > 0);
  const invoicesBefore = await prisma.vendorInvoice.count({
    where: { invoiceNumber: draftPayload.invoiceNumber },
  });
  const keysBefore = await prisma.ledgerIdempotencyKey.count({
    where: { key: invoiceIdempotencyKey(draftPayload.vendorName, draftPayload.invoiceNumber) },
  });
  assert.equal(invoicesBefore, 0);
  assert.equal(keysBefore, 0);

  const resolved = applyOcrDraftResolutions(draftPayload, {
    lines: [{ index: 1, line_name: `Lemons ${stamp}`, quantity: 1, department: 'PRODUCE' }],
  });
  assert.equal(
    draftPostingBlockers(resolved, { actorIsManager: false, manualReviewOverride: false }).length,
    0
  );
  await prisma.invoiceOcrDraft.update({
    where: { id: draft.id },
    data: { payload: resolved as unknown as Prisma.InputJsonValue },
  });
  const committed = await commitInvoiceOcrReceipts({
    staffId: `staff-${stamp}`,
    referenceId: resolved.invoiceNumber,
    confirmedItems: resolved.lines.map((line) => ({
      product_id: line.product_id,
      quantity: line.quantity,
      quantity_kind: line.quantity_kind,
      unit_cost: line.unit_cost,
      line_name: line.line_name,
      department: line.department,
      case_pack_size: line.case_pack_size,
      line_confidence: line.line_confidence,
    })),
    invoiceMeta: {
      vendorName: resolved.vendorName,
      invoiceNumber: resolved.invoiceNumber,
      invoiceDate: resolved.invoiceDate,
      totalAmount: resolved.totalAmount,
      departmentBreakdown: resolved.departmentBreakdown,
    },
    idempotencyKey: invoiceIdempotencyKey(resolved.vendorName, resolved.invoiceNumber),
    draftId: draft.id,
    actorIsManager: false,
  });
  assert.ok(committed.invoiceId);
  assert.equal(committed.transactionsCreated, 2);
  const lots = await prisma.inventoryLot.count({
    where: { receiveReferenceId: resolved.invoiceNumber },
  });
  assert.equal(lots, 2);
  const key = await prisma.ledgerIdempotencyKey.findUnique({
    where: { key: invoiceIdempotencyKey(resolved.vendorName, resolved.invoiceNumber) },
  });
  assert.ok(key);
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
  const base = {
    invoiceDate: '2026-11-08',
    totalAmount: 3,
    departmentBreakdown: { PRODUCE: 3, DAIRY: 0, BAKERY: 0, PANTRY: 0 },
    lineItems: [item],
  };
  const a = stableLogId({ vendorName: `Vendor A ${stamp}`, invoiceNumber: 'INV-100', ...base }, item, 0);
  const b = stableLogId({ vendorName: `Vendor B ${stamp}`, invoiceNumber: 'INV-100', ...base }, item, 0);
  const c = stableLogId({ vendorName: `Vendor A ${stamp}`, invoiceNumber: 'INV/100', ...base }, item, 0);
  assert.notEqual(a, b);
  assert.notEqual(a, c);

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
