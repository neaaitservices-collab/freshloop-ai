import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { InventoryLocation } from '@prisma/client';
import { POST as identifyInvoice } from '@/app/api/receiving-invoices/identity/route';
import { POST as reconcileInvoice } from '@/app/api/receiving-invoices/reconcile/route';
import { POST as postReceivingLog } from '@/app/api/receiving-logs/route';
import { POST as postInvoiceOcr } from '@/app/api/invoice-ocr/route';
import { AuthError } from '@/lib/auth/session';
import { useReceivingStaffTestAuth } from '@/lib/auth/guardRoute';
import { getCurrentStock, prisma } from '@/lib/domains/inventory/ledger';
import { saveInvoiceOcrDraft } from '@/lib/domains/receiving/invoiceOcrCommit';
import { readJsonResponse } from '@/lib/testing/posWebhookHttp';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('receiving identity routes block unsafe replays and keep partial commits atomic', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `http-${Date.now()}`;
  const clerk = await prisma.user.create({
    data: {
      name: `Clerk ${stamp}`,
      email: `${stamp}@example.com`,
      position: 'Receiver',
      role: 'RECEIVING_CLERK',
    },
  });
  const supplier = await prisma.supplier.create({ data: { name: `Http Supplier ${stamp}` } });
  const apples = await prisma.product.create({
    data: { name: `Http Apple ${stamp}`, department: 'PRODUCE', standardCost: 1, retailPrice: 2, shelfLifeDays: 4 },
  });
  const pears = await prisma.product.create({
    data: { name: `Http Pear ${stamp}`, department: 'PRODUCE', standardCost: 1, retailPrice: 2, shelfLifeDays: 4 },
  });

  t.after(async () => {
    useReceivingStaffTestAuth(null);
    const deliveries = await prisma.receivingDelivery.findMany({
      where: { catalogProductId: { in: [apples.id, pears.id] } },
      select: { id: true },
    });
    await prisma.ledgerIdempotencyKey.deleteMany({
      where: {
        OR: [
          { key: { in: deliveries.map((row) => `recv:${row.id}`) } },
          { key: { in: [`invoice:acme foods:old-${stamp}`, `invoice:other shop:old-${stamp}`] } },
        ],
      },
    });
    await prisma.receivingDelivery.deleteMany({ where: { id: { in: deliveries.map((row) => row.id) } } });
    await prisma.supplierInvoiceDocument.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.invoiceLineItem.deleteMany({ where: { invoice: { supplierId: supplier.id } } });
    await prisma.vendorInvoice.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.invoiceOcrDraft.deleteMany({ where: { staffId: clerk.id } });
    await prisma.inventoryLot.deleteMany({ where: { productId: { in: [apples.id, pears.id] } } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: { in: [apples.id, pears.id] } } });
    await prisma.product.deleteMany({ where: { id: { in: [apples.id, pears.id] } } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
    await prisma.user.delete({ where: { id: clerk.id } });
  });

  useReceivingStaffTestAuth(async () => {
    throw new AuthError('Unauthorized — sign in required.', 401);
  });
  const anonymous = await identifyInvoice(
    request('/api/receiving-invoices/identity', {
      supplierId: supplier.id,
      invoiceNumber: `N-${stamp}`,
      invoiceDate: '2024-01-02',
      lines: [{ printedName: `Apple ${stamp}` }],
    })
  );
  assert.equal(anonymous.status, 401);

  useReceivingStaffTestAuth(async () => ({
    id: clerk.id,
    name: clerk.name,
    email: clerk.email,
    role: 'RECEIVING_CLERK',
    position: clerk.position,
    hourlyRate: null,
  }));

  const first = await readJsonResponse(
    await identifyInvoice(
      request('/api/receiving-invoices/identity', {
        supplierId: supplier.id,
        invoiceNumber: `N-${stamp}`,
        invoiceDate: '2024-01-02',
        lines: [{ printedName: `Apple ${stamp}` }],
      })
    )
  );
  assert.equal(first.status, 200);
  const firstLine = (first.body.lines as { deliveryId: string }[])[0]?.deliveryId;
  assert.ok(firstLine);
  const posted = await readJsonResponse(
    await postReceivingLog(
      request('/api/receiving-logs', {
        itemName: `Apple ${stamp}`,
        productId: apples.id,
        casesReceived: 2,
        caseCost: 3,
        packSize: 1,
        splitFactor: 1,
        retailUnit: 'units',
        marginMode: '40',
        currentRetailPrice: 0,
        externalLogId: firstLine,
        supplierId: supplier.id,
      })
    )
  );
  assert.equal(posted.status, 200);
  assert.equal(await getCurrentStock(apples.id, InventoryLocation.Retail_Floor), 2);

  const yearApart = await readJsonResponse(
    await identifyInvoice(
      request('/api/receiving-invoices/identity', {
        supplierId: supplier.id,
        invoiceNumber: `N-${stamp}`,
        invoiceDate: '2026-01-02',
        lines: [{ printedName: `Apple ${stamp}` }],
      })
    )
  );
  assert.equal(yearApart.status, 409);
  assert.equal(yearApart.body.code, 'DATE_CONFLICT');
  assert.equal(await getCurrentStock(apples.id, InventoryLocation.Retail_Floor), 2);

  const missingDate = await readJsonResponse(
    await identifyInvoice(
      request('/api/receiving-invoices/identity', {
        supplierId: supplier.id,
        invoiceNumber: `N-${stamp}`,
        lines: [{ printedName: `Apple ${stamp}` }],
      })
    )
  );
  assert.equal(missingDate.status, 409);
  assert.equal(missingDate.body.code, 'DATE_REQUIRED');

  const spaced = await readJsonResponse(
    await identifyInvoice(
      request('/api/receiving-invoices/identity', {
        supplierId: supplier.id,
        invoiceNumber: `A 12 ${stamp}`,
        invoiceDate: '2024-05-01',
        lines: [{ printedName: `Apple ${stamp}` }],
      })
    )
  );
  assert.equal(spaced.status, 200);
  const compact = await readJsonResponse(
    await identifyInvoice(
      request('/api/receiving-invoices/identity', {
        supplierId: supplier.id,
        invoiceNumber: `A12 ${stamp}`,
        invoiceDate: '2024-05-01',
        lines: [{ printedName: `Apple ${stamp}` }],
      })
    )
  );
  assert.equal(compact.status, 409);
  assert.equal(compact.body.code, 'WHITESPACE_CONFLICT');
  assert.notEqual((spaced.body.lines as { deliveryId: string }[])[0]?.deliveryId, undefined);

  const pair = await readJsonResponse(
    await identifyInvoice(
      request('/api/receiving-invoices/identity', {
        supplierId: supplier.id,
        invoiceNumber: `PAIR-${stamp}`,
        invoiceDate: '2024-06-01',
        lines: [{ printedName: `Apple ${stamp}` }, { printedName: `Pear ${stamp}` }],
      })
    )
  );
  assert.equal(pair.status, 200);
  const pairLines = pair.body.lines as { deliveryId: string }[];
  for (const [index, name] of [`Apple ${stamp}`, `Pear ${stamp}`].entries()) {
    const row = await readJsonResponse(
      await postReceivingLog(
        request('/api/receiving-logs', {
          itemName: name,
          productId: index === 0 ? apples.id : pears.id,
          casesReceived: 1,
          caseCost: 2,
          packSize: 1,
          splitFactor: 1,
          retailUnit: 'units',
          marginMode: '40',
          currentRetailPrice: 0,
          externalLogId: pairLines[index]?.deliveryId,
          supplierId: supplier.id,
        })
      )
    );
    assert.equal(row.status, 200);
  }
  const withExtra = await readJsonResponse(
    await identifyInvoice(
      request('/api/receiving-invoices/identity', {
        supplierId: supplier.id,
        invoiceNumber: `PAIR-${stamp}`,
        invoiceDate: '2024-06-01',
        lines: [
          { printedName: `Apple ${stamp}` },
          { printedName: `Pear ${stamp}` },
          { printedName: `Extra ${stamp}` },
        ],
      })
    )
  );
  assert.equal(withExtra.status, 409);
  assert.equal(withExtra.body.code, 'LINES_NEED_CONFIRMATION');
  const added = await readJsonResponse(
    await reconcileInvoice(
      request('/api/receiving-invoices/reconcile', {
        action: 'add-lines',
        supplierId: supplier.id,
        invoiceNumber: `PAIR-${stamp}`,
        invoiceDate: '2024-06-01',
        lines: [
          { printedName: `Apple ${stamp}` },
          { printedName: `Pear ${stamp}` },
          { printedName: `Extra ${stamp}` },
        ],
        confirmNewPrintedNames: withExtra.body.newPrintedNames,
      })
    )
  );
  assert.equal(added.status, 200);
  const addedLines = added.body.lines as { deliveryId: string }[];
  assert.equal(addedLines[0]?.deliveryId, pairLines[0]?.deliveryId);
  assert.equal(addedLines[1]?.deliveryId, pairLines[1]?.deliveryId);
  assert.notEqual(addedLines[2]?.deliveryId, pairLines[0]?.deliveryId);
  const extraPost = await readJsonResponse(
    await postReceivingLog(
      request('/api/receiving-logs', {
        itemName: `Extra ${stamp}`,
        productId: apples.id,
        casesReceived: 1,
        caseCost: 2,
        packSize: 1,
        splitFactor: 1,
        retailUnit: 'units',
        marginMode: '40',
        currentRetailPrice: 0,
        externalLogId: addedLines[2]?.deliveryId,
        supplierId: supplier.id,
      })
    )
  );
  assert.equal(extraPost.status, 200);
  const appleAfterExtra = await getCurrentStock(apples.id, InventoryLocation.Retail_Floor);
  const extraReplay = await readJsonResponse(
    await postReceivingLog(
      request('/api/receiving-logs', {
        itemName: `Extra ${stamp}`,
        productId: apples.id,
        casesReceived: 1,
        caseCost: 2,
        packSize: 1,
        splitFactor: 1,
        retailUnit: 'units',
        marginMode: '40',
        currentRetailPrice: 0,
        externalLogId: addedLines[2]?.deliveryId,
        supplierId: supplier.id,
      })
    )
  );
  const replayStock = extraReplay.body.stock as { idempotent?: boolean };
  assert.equal(replayStock.idempotent, true);
  assert.equal(await getCurrentStock(apples.id, InventoryLocation.Retail_Floor), appleAfterExtra);
  const renamed = await readJsonResponse(
    await identifyInvoice(
      request('/api/receiving-invoices/identity', {
        supplierId: supplier.id,
        invoiceNumber: `PAIR-${stamp}`,
        invoiceDate: '2024-06-01',
        lines: [{ printedName: `Apple ${stamp}` }, { printedName: `Renamed pear ${stamp}` }],
      })
    )
  );
  assert.equal(renamed.status, 409);
  assert.equal(renamed.body.code, 'RENAME_AMBIGUOUS');
  assert.equal(await getCurrentStock(apples.id, InventoryLocation.Retail_Floor), appleAfterExtra);
  const stored = (renamed.body.unmatchedStoredLines as { id: string }[])[0];
  const mapped = await readJsonResponse(
    await reconcileInvoice(
      request('/api/receiving-invoices/reconcile', {
        action: 'map-line',
        supplierId: supplier.id,
        invoiceNumber: `PAIR-${stamp}`,
        invoiceDate: '2024-06-01',
        lines: [{ printedName: `Apple ${stamp}` }, { printedName: `Renamed pear ${stamp}` }],
        fromLineId: stored?.id,
        mappedPrintedName: `Renamed pear ${stamp}`,
      })
    )
  );
  assert.equal(mapped.status, 200);
  const mappedLines = mapped.body.lines as { deliveryId: string }[];
  assert.equal(mappedLines[1]?.deliveryId, pairLines[1]?.deliveryId);

  const legacyNumber = `OLD-${stamp}`;
  const legacyKey = `invoice:acme foods:${legacyNumber.toLowerCase()}`;
  const otherKey = `invoice:other shop:${legacyNumber.toLowerCase()}`;
  await prisma.ledgerIdempotencyKey.create({ data: { key: legacyKey } });
  await prisma.ledgerIdempotencyKey.create({ data: { key: otherKey } });
  await prisma.inventoryTransaction.create({
    data: {
      productId: pears.id,
      staffId: clerk.id,
      qtyChange: 5,
      transactionType: 'Receive',
      fromLocation: 'External_Vendor',
      toLocation: 'Retail_Floor',
      unitCostAtTime: 1,
      referenceId: legacyKey,
    },
  });
  const beforeLegacy = await getCurrentStock(pears.id, InventoryLocation.Retail_Floor);
  const legacyIdentity = await readJsonResponse(
    await identifyInvoice(
      request('/api/receiving-invoices/identity', {
        supplierId: supplier.id,
        invoiceNumber: legacyNumber,
        invoiceDate: '2024-07-01',
        lines: [{ printedName: `Pear ${stamp}` }],
      })
    )
  );
  assert.equal(legacyIdentity.status, 409);
  assert.equal(legacyIdentity.body.code, 'LEGACY_RECEIPT_PRESENT');
  assert.equal((legacyIdentity.body.legacyReceipts as unknown[]).length, 2);
  const legacyDraft = await saveInvoiceOcrDraft(clerk.id, {
    vendorName: 'Acme Foods',
    invoiceNumber: legacyNumber,
    invoiceDate: '2024-07-01',
    totalAmount: 4,
    departmentBreakdown: { PRODUCE: 4 },
    lines: [
      {
        product_id: pears.id,
        quantity: 2,
        quantity_kind: 'units',
        unit_cost: 2,
        line_name: `Pear ${stamp}`,
        department: 'PRODUCE',
        line_confidence: 0.95,
        requires_approval: false,
      },
    ],
  });
  const legacyCommit = await readJsonResponse(
    await postInvoiceOcr(
      request('/api/invoice-ocr', {
        confirmCommit: true,
        draftId: legacyDraft.id,
        supplierId: supplier.id,
      })
    )
  );
  assert.equal(legacyCommit.status, 409);
  assert.equal(legacyCommit.body.code, 'LEGACY_RECEIPT_PRESENT');
  assert.equal(await getCurrentStock(pears.id, InventoryLocation.Retail_Floor), beforeLegacy);
  const adopted = await readJsonResponse(
    await reconcileInvoice(
      request('/api/receiving-invoices/reconcile', {
        action: 'adopt-legacy',
        supplierId: supplier.id,
        invoiceNumber: legacyNumber,
        invoiceDate: '2024-07-01',
        lines: [{ printedName: `Pear ${stamp}` }],
        legacyKey,
      })
    )
  );
  assert.equal(adopted.status, 200);
  const adoptedId = (adopted.body.lines as { deliveryId: string }[])[0]?.deliveryId;
  const adoptedPost = await readJsonResponse(
    await postReceivingLog(
      request('/api/receiving-logs', {
        itemName: `Pear ${stamp}`,
        productId: pears.id,
        casesReceived: 2,
        caseCost: 2,
        packSize: 1,
        splitFactor: 1,
        retailUnit: 'units',
        marginMode: '40',
        currentRetailPrice: 0,
        externalLogId: adoptedId,
        supplierId: supplier.id,
      })
    )
  );
  assert.equal(adoptedPost.status, 200);
  const legacyDraftAgain = await saveInvoiceOcrDraft(clerk.id, {
    vendorName: 'Acme Foods',
    invoiceNumber: legacyNumber,
    invoiceDate: '2024-07-01',
    totalAmount: 4,
    departmentBreakdown: { PRODUCE: 4 },
    lines: [
      {
        product_id: pears.id,
        quantity: 2,
        quantity_kind: 'units',
        unit_cost: 2,
        line_name: `Pear ${stamp}`,
        department: 'PRODUCE',
        line_confidence: 0.95,
        requires_approval: false,
      },
    ],
  });
  const adoptedCommit = await readJsonResponse(
    await postInvoiceOcr(
      request('/api/invoice-ocr', {
        confirmCommit: true,
        draftId: legacyDraftAgain.id,
        supplierId: supplier.id,
      })
    )
  );
  assert.equal(adoptedCommit.status, 200);
  assert.equal(adoptedCommit.body.transactionsCreated, 0);
  assert.equal(await getCurrentStock(pears.id, InventoryLocation.Retail_Floor), beforeLegacy);
  assert.equal(await prisma.ledgerIdempotencyKey.count({ where: { key: { in: [legacyKey, otherKey] } } }), 2);

  const conflictDraft = await saveInvoiceOcrDraft(clerk.id, {
    vendorName: `Http Supplier ${stamp}`,
    invoiceNumber: `SPLIT-${stamp}`,
    invoiceDate: '2024-08-01',
    totalAmount: 8,
    departmentBreakdown: { PRODUCE: 8 },
    lines: [
      {
        product_id: apples.id,
        quantity: 2,
        quantity_kind: 'units',
        unit_cost: 3,
        line_name: `Split apple ${stamp}`,
        department: 'PRODUCE',
        line_confidence: 0.95,
        requires_approval: false,
      },
      {
        product_id: pears.id,
        quantity: 2,
        quantity_kind: 'units',
        unit_cost: 3,
        line_name: `Split pear ${stamp}`,
        department: 'PRODUCE',
        line_confidence: 0.95,
        requires_approval: false,
      },
    ],
  });
  const splitIdentity = await readJsonResponse(
    await identifyInvoice(
      request('/api/receiving-invoices/identity', {
        supplierId: supplier.id,
        invoiceNumber: `SPLIT-${stamp}`,
        invoiceDate: '2024-08-01',
        lines: [{ printedName: `Split apple ${stamp}` }, { printedName: `Split pear ${stamp}` }],
      })
    )
  );
  assert.equal(splitIdentity.status, 200);
  const splitLines = splitIdentity.body.lines as { deliveryId: string }[];
  const seededPear = await readJsonResponse(
    await postReceivingLog(
      request('/api/receiving-logs', {
        itemName: `Split pear ${stamp}`,
        productId: pears.id,
        casesReceived: 2,
        caseCost: 9,
        packSize: 1,
        splitFactor: 1,
        retailUnit: 'units',
        marginMode: '40',
        currentRetailPrice: 0,
        externalLogId: splitLines[1]?.deliveryId,
        supplierId: supplier.id,
      })
    )
  );
  assert.equal(seededPear.status, 200);
  const applesBeforeConflict = await getCurrentStock(apples.id, InventoryLocation.Retail_Floor);
  const conflictCommit = await readJsonResponse(
    await postInvoiceOcr(
      request('/api/invoice-ocr', {
        confirmCommit: true,
        draftId: conflictDraft.id,
        supplierId: supplier.id,
      })
    )
  );
  assert.equal(conflictCommit.status, 409);
  assert.equal(conflictCommit.body.committed, false);
  assert.equal(Array.isArray(conflictCommit.body.results), true);
  assert.equal(await getCurrentStock(apples.id, InventoryLocation.Retail_Floor), applesBeforeConflict);
});
