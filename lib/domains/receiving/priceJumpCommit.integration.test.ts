import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { InventoryLocation } from '@prisma/client';
import { POST as postInvoiceOcr } from '@/app/api/invoice-ocr/route';
import { setReceivingStaffTestAuth } from '@/lib/auth/receivingStaffTestAuth';
import { getCurrentStock, prisma } from '@/lib/domains/inventory/ledger';
import { saveInvoiceOcrDraft } from '@/lib/domains/receiving/invoiceOcrCommit';
import { readJsonResponse } from '@/lib/testing/posWebhookHttp';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';

/** True only for the CI database named freshloop_ci. Any other DATABASE_URL skips. */
function isFreshloopCiTestDatabase(url: string, dbTestsFlag: string | undefined): boolean {
  if (!url.trim() || dbTestsFlag === '0') return false;
  try {
    const database = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
    return database === 'freshloop_ci';
  } catch {
    return false;
  }
}

const hasCiDb = isFreshloopCiTestDatabase(databaseUrl, process.env.FRESHLOOP_DB_TESTS);

function request(body: unknown) {
  return new NextRequest('http://localhost:3000/api/invoice-ocr', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('price-jump commit runs only against the freshloop_ci database', () => {
  const ci = 'postgresql://ci:ci@127.0.0.1:5432/freshloop_ci?schema=public';
  assert.equal(isFreshloopCiTestDatabase(ci, undefined), true);
  assert.equal(isFreshloopCiTestDatabase(ci, '0'), false);
  assert.equal(isFreshloopCiTestDatabase('postgresql://u:p@127.0.0.1:5432/freshloop', undefined), false);
  assert.equal(isFreshloopCiTestDatabase('', undefined), false);
});

test('a manager override commits a price-jump draft with matching totals', { skip: !hasCiDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `jump-${Date.now()}`;
  const ids: { user?: string; supplier?: string; product?: string; draft?: string } = {};
  t.after(async () => {
    setReceivingStaffTestAuth(null);
    const productId = ids.product;
    if (productId) {
      const deliveries = await prisma.receivingDelivery.findMany({
        where: { catalogProductId: productId },
        select: { id: true },
      });
      const deliveryIds = deliveries.map((row) => row.id);
      await prisma.ledgerIdempotencyKey.deleteMany({
        where: { key: { in: deliveryIds.map((id) => `recv:${id}`) } },
      });
      await prisma.receivingDelivery.deleteMany({ where: { id: { in: deliveryIds } } });
      await prisma.inventoryLot.deleteMany({ where: { productId } });
      await prisma.inventoryTransaction.deleteMany({ where: { productId } });
    }
    if (ids.supplier) {
      await prisma.invoiceLineItem.deleteMany({ where: { invoice: { supplierId: ids.supplier } } });
      await prisma.vendorInvoice.deleteMany({ where: { supplierId: ids.supplier } });
      await prisma.supplierInvoiceDocument.deleteMany({ where: { supplierId: ids.supplier } });
      await prisma.supplier.deleteMany({ where: { id: ids.supplier } });
    }
    if (ids.draft) await prisma.invoiceOcrDraft.deleteMany({ where: { id: ids.draft } });
    if (ids.user) {
      await prisma.invoiceOcrDraft.deleteMany({ where: { staffId: ids.user } });
      await prisma.user.deleteMany({ where: { id: ids.user } });
    }
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
  });

  const user = await prisma.user.create({
    data: {
      name: `Manager ${stamp}`,
      email: `${stamp}@example.com`,
      position: 'Receiver',
      role: 'RECEIVING_CLERK',
    },
  });
  ids.user = user.id;
  const supplier = await prisma.supplier.create({ data: { name: `Jump Supplier ${stamp}` } });
  ids.supplier = supplier.id;
  const product = await prisma.product.create({
    data: {
      name: `Bananas ${stamp}`,
      department: 'PRODUCE',
      standardCost: 5,
      retailPrice: 8,
      shelfLifeDays: 4,
    },
  });
  ids.product = product.id;
  const invoiceNumber = `INV-${stamp}`;
  const draft = await saveInvoiceOcrDraft(user.id, {
    vendorName: `Jump Supplier ${stamp}`,
    invoiceNumber,
    invoiceDate: '2026-11-13',
    totalAmount: 10,
    printedSubtotal: 10,
    departmentBreakdown: { PRODUCE: 10 },
    lines: [
      {
        product_id: product.id,
        quantity: 2,
        quantity_kind: 'units',
        unit_cost: 5,
        line_name: `Bananas ${stamp}`,
        department: 'PRODUCE',
        line_confidence: 0.96,
        requires_approval: true,
      },
    ],
  });
  ids.draft = draft.id;

  const asRole = (role: 'RECEIVING_CLERK' | 'STORE_MANAGER') => {
    setReceivingStaffTestAuth(async () => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role,
      position: user.position,
      hourlyRate: null,
    }));
  };

  asRole('RECEIVING_CLERK');
  const blocked = await readJsonResponse(
    await postInvoiceOcr(
      request({
        confirmCommit: true,
        draftId: draft.id,
        supplierId: supplier.id,
      })
    )
  );
  assert.equal(blocked.status, 409);
  assert.match(String(blocked.body.error ?? ''), /cost_guardrail/);
  const blockedReasons = blocked.body.blockers;
  assert.equal(Array.isArray(blockedReasons) && blockedReasons.some((row) => /cost_guardrail/.test(String(row))), true);
  assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 0);
  const stillOpen = await prisma.invoiceOcrDraft.findUnique({
    where: { id: draft.id },
    select: { consumedAt: true },
  });
  assert.equal(stillOpen?.consumedAt, null);

  const clerkOverride = await readJsonResponse(
    await postInvoiceOcr(
      request({
        confirmCommit: true,
        draftId: draft.id,
        supplierId: supplier.id,
        manualReviewOverride: true,
      })
    )
  );
  assert.equal(clerkOverride.status, 409);
  assert.match(String(clerkOverride.body.error ?? ''), /cost_guardrail/);
  assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 0);

  asRole('STORE_MANAGER');
  const committed = await readJsonResponse(
    await postInvoiceOcr(
      request({
        confirmCommit: true,
        draftId: draft.id,
        supplierId: supplier.id,
        manualReviewOverride: true,
      })
    )
  );
  assert.equal(committed.status, 200);
  assert.equal(committed.body.committed, true);
  assert.equal(committed.body.transactionsCreated, 1);
  assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 2);
  const stored = await prisma.invoiceOcrDraft.findUnique({
    where: { id: draft.id },
    select: { consumedAt: true },
  });
  assert.ok(stored?.consumedAt);
});
