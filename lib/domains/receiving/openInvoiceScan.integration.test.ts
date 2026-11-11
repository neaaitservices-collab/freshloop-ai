import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '@/lib/domains/inventory/ledger';
import { saveInvoiceOcrDraft } from '@/lib/domains/receiving/invoiceOcrCommit';
import { receiveAcceptedInvoiceOcr } from '@/lib/domains/receiving/invoiceOcrReceive';
import {
  discardOpenInvoiceScan,
  loadOpenInvoiceScan,
} from '@/lib/domains/receiving/openInvoiceScanStore';
import { resolveSupplierInvoice } from '@/lib/domains/receiving/supplierInvoiceIdentity';

function scratchDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim() ?? '';
  if (!url || process.env.FRESHLOOP_DB_TESTS === '0') return null;
  try {
    const host = new URL(url).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return url;
  } catch {
    return null;
  }
  return null;
}

const hasScratchDb = Boolean(scratchDatabaseUrl());

test('an open invoice scan survives a reload until it is discarded', { skip: !hasScratchDb }, async (t) => {
  const staffId = `scan-draft-${Date.now()}`;
  try {
    await prisma.$connect();
  } catch {
    t.skip('Scratch database unreachable.');
    return;
  }
  t.after(async () => {
    await prisma.invoiceOcrDraft.deleteMany({ where: { staffId } });
  });

  const saved = await saveInvoiceOcrDraft(staffId, {
    vendorName: 'North Market',
    invoiceNumber: `INV-${staffId}`,
    invoiceDate: '2026-11-02',
    totalAmount: 12,
    departmentBreakdown: { PRODUCE: 12 },
    lines: [
      {
        product_id: '',
        quantity: 3,
        quantity_kind: 'cases',
        unit_cost: 4,
        line_name: 'Bananas',
        department: 'PRODUCE',
        case_pack_size: 40,
        line_confidence: 0.91,
        requires_approval: false,
      },
    ],
  });

  const restored = await loadOpenInvoiceScan(staffId);
  assert.equal(restored?.draftId, saved.id);
  assert.equal(restored?.invoiceNumber, `INV-${staffId}`);
  assert.equal(restored?.lineItems[0]?.name, 'Bananas');
  assert.equal(restored?.lineItems[0]?.quantity, 3);

  const discarded = await discardOpenInvoiceScan(staffId, saved.id);
  assert.equal(discarded.ok, true);
  const closed = await prisma.invoiceOcrDraft.findUnique({ where: { id: saved.id } });
  assert.ok(closed?.consumedAt);
  assert.equal(await loadOpenInvoiceScan(staffId), null);
  const again = await discardOpenInvoiceScan(staffId, saved.id);
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.status, 409);
  const missing = await discardOpenInvoiceScan(staffId, `missing-${staffId}`);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.status, 404);
});

test('discard keeps posted lines and a retry is already posted', { skip: !hasScratchDb }, async (t) => {
  const stamp = `scan-post-${Date.now()}`;
  const staffId = `staff-${stamp}`;
  try {
    await prisma.$connect();
  } catch {
    t.skip('Scratch database unreachable.');
    return;
  }

  const supplier = await prisma.supplier.create({ data: { name: `North ${stamp}` } });
  const product = await prisma.product.create({
    data: {
      name: `Bananas ${stamp}`,
      department: 'PRODUCE',
      standardCost: 1,
      retailPrice: 2,
      shelfLifeDays: 4,
    },
  });
  t.after(async () => {
    const deliveries = await prisma.receivingDelivery.findMany({
      where: { OR: [{ catalogProductId: product.id }, { productId: product.id }] },
      select: { id: true },
    });
    const deliveryIds = deliveries.map((row) => row.id);
    await prisma.ledgerIdempotencyKey.deleteMany({
      where: { key: { in: deliveryIds.map((id) => `recv:${id}`) } },
    });
    await prisma.receivingDelivery.deleteMany({ where: { id: { in: deliveryIds } } });
    await prisma.supplierInvoiceDocument.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.invoiceOcrDraft.deleteMany({ where: { staffId } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });

  const older = await saveInvoiceOcrDraft(staffId, {
    vendorName: `Older ${stamp}`,
    invoiceNumber: `OLD-${stamp}`,
    invoiceDate: '2026-11-01',
    totalAmount: 4,
    departmentBreakdown: { PRODUCE: 4 },
    lines: [
      {
        product_id: product.id,
        quantity: 1,
        quantity_kind: 'units',
        unit_cost: 4,
        line_name: `Older bananas ${stamp}`,
        department: 'PRODUCE',
        case_pack_size: 1,
        line_confidence: 0.95,
        requires_approval: false,
      },
    ],
  });
  const draft = await saveInvoiceOcrDraft(staffId, {
    vendorName: `North ${stamp}`,
    invoiceNumber: `INV-${stamp}`,
    invoiceDate: '2026-11-03',
    totalAmount: 10,
    departmentBreakdown: { PRODUCE: 10 },
    lines: [
      {
        product_id: product.id,
        quantity: 2,
        quantity_kind: 'units',
        unit_cost: 3,
        line_name: `Bananas ${stamp}`,
        department: 'PRODUCE',
        case_pack_size: 1,
        line_confidence: 0.95,
        requires_approval: false,
      },
      {
        product_id: product.id,
        quantity: 1,
        quantity_kind: 'units',
        unit_cost: 4,
        line_name: `Pears ${stamp}`,
        department: 'PRODUCE',
        case_pack_size: 1,
        line_confidence: 0.95,
        requires_approval: false,
      },
    ],
  });
  const identity = await resolveSupplierInvoice({
    supplierId: supplier.id,
    invoiceNumber: `INV-${stamp}`,
    invoiceDate: '2026-11-03',
    lines: [{ printedName: `Bananas ${stamp}` }, { printedName: `Pears ${stamp}` }],
  });
  assert.equal(identity.ok, true);
  if (!identity.ok) return;

  const posted = await receiveAcceptedInvoiceOcr({
    actorId: staffId,
    actorIsManager: false,
    body: {
      draftId: draft.id,
      acceptDraft: true,
      supplierId: supplier.id,
      items: [
        {
          draftLineIndex: 0,
          externalLogId: identity.lines[0]?.deliveryId,
          retailUnit: 'units',
          marginMode: '40',
          currentRetailPrice: 2,
          packSize: 1,
          splitFactor: 1,
        },
      ],
    },
  });
  assert.equal(posted.ok, true);
  const partial = await prisma.invoiceOcrDraft.findUnique({ where: { id: draft.id } });
  assert.equal(partial?.consumedAt, null);

  const discarded = await discardOpenInvoiceScan(staffId, draft.id);
  assert.equal(discarded.ok, true);
  const stored = await prisma.invoiceOcrDraft.findUnique({ where: { id: draft.id } });
  assert.ok(stored?.consumedAt);
  const payload = stored?.payload as {
    postedLineIndexes?: number[];
    postedBy?: { index: number; actorId: string }[];
  };
  assert.deepEqual(payload.postedLineIndexes, [0]);
  assert.equal(payload.postedBy?.[0]?.index, 0);
  assert.equal(payload.postedBy?.[0]?.actorId, staffId);
  const olderRow = await prisma.invoiceOcrDraft.findUnique({ where: { id: older.id } });
  assert.equal(olderRow?.consumedAt, null);
  assert.equal((await loadOpenInvoiceScan(staffId))?.draftId, older.id);

  const retry = await receiveAcceptedInvoiceOcr({
    actorId: staffId,
    actorIsManager: false,
    body: {
      draftId: draft.id,
      acceptDraft: true,
      supplierId: supplier.id,
      items: [
        {
          draftLineIndex: 0,
          externalLogId: identity.lines[0]?.deliveryId,
          retailUnit: 'units',
          marginMode: '40',
          currentRetailPrice: 2,
        },
      ],
    },
  });
  assert.equal(retry.ok, false);
  if (retry.ok) return;
  assert.equal(retry.status, 409);
  assert.equal(retry.code, 'OCR_DRAFT_DISCARDED');

  const finished = await saveInvoiceOcrDraft(staffId, {
    vendorName: `North ${stamp}`,
    invoiceNumber: `DONE-${stamp}`,
    invoiceDate: '2026-11-04',
    totalAmount: 3,
    departmentBreakdown: { PRODUCE: 3 },
    lines: [
      {
        product_id: product.id,
        quantity: 1,
        quantity_kind: 'units',
        unit_cost: 3,
        line_name: `Done bananas ${stamp}`,
        department: 'PRODUCE',
        case_pack_size: 1,
        line_confidence: 0.95,
        requires_approval: false,
      },
    ],
  });
  const finishedIdentity = await resolveSupplierInvoice({
    supplierId: supplier.id,
    invoiceNumber: `DONE-${stamp}`,
    invoiceDate: '2026-11-04',
    lines: [{ printedName: `Done bananas ${stamp}` }],
  });
  assert.equal(finishedIdentity.ok, true);
  if (!finishedIdentity.ok) return;
  const savedAll = await receiveAcceptedInvoiceOcr({
    actorId: staffId,
    actorIsManager: false,
    body: {
      draftId: finished.id,
      acceptDraft: true,
      supplierId: supplier.id,
      items: [
        {
          draftLineIndex: 0,
          externalLogId: finishedIdentity.lines[0]?.deliveryId,
          retailUnit: 'units',
          marginMode: '40',
          currentRetailPrice: 2,
        },
      ],
    },
  });
  assert.equal(savedAll.ok, true);
  const closedSave = await prisma.invoiceOcrDraft.findUnique({ where: { id: finished.id } });
  assert.ok(closedSave?.consumedAt);
  const savedAgain = await receiveAcceptedInvoiceOcr({
    actorId: staffId,
    actorIsManager: false,
    body: {
      draftId: finished.id,
      acceptDraft: true,
      supplierId: supplier.id,
      items: [
        {
          draftLineIndex: 0,
          externalLogId: finishedIdentity.lines[0]?.deliveryId,
          retailUnit: 'units',
          marginMode: '40',
          currentRetailPrice: 2,
        },
      ],
    },
  });
  assert.equal(savedAgain.ok, false);
  if (savedAgain.ok) return;
  assert.equal(savedAgain.status, 409);
  assert.equal(savedAgain.code, 'DRAFT_ALREADY_RECEIVED');
});
