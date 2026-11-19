import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryLocation } from '@prisma/client';
import { getCurrentStock, prisma } from '@/lib/domains/inventory/ledger';
import { commitInvoiceOcrReceipts, saveInvoiceOcrDraft } from '@/lib/domains/receiving/invoiceOcrCommit';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

test('a $0 review line does not roll back paid lines, and the invoice is consumed', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `zero-${Date.now()}`;
  const supplier = await prisma.supplier.create({ data: { name: `Dock ${stamp}` } });
  const paid = await prisma.product.create({
    data: { name: `Paid apples ${stamp}`, department: 'PRODUCE', standardCost: 1, retailPrice: 2, shelfLifeDays: 4 },
  });
  const free = await prisma.product.create({
    data: { name: `Free greens ${stamp}`, department: 'PRODUCE', standardCost: 1, retailPrice: 2, shelfLifeDays: 4 },
  });
  const staffId = `staff-${stamp}`;
  const invoiceNumber = `INV-${stamp}`;

  t.after(async () => {
    const productIds = [paid.id, free.id];
    const deliveries = await prisma.receivingDelivery.findMany({
      where: { catalogProductId: { in: productIds } },
      select: { id: true },
    });
    const deliveryIds = deliveries.map((row) => row.id);
    await prisma.ledgerIdempotencyKey.deleteMany({
      where: { key: { in: deliveryIds.map((id) => `recv:${id}`) } },
    });
    await prisma.receivingDelivery.deleteMany({ where: { id: { in: deliveryIds } } });
    await prisma.supplierInvoiceDocument.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.invoiceLineItem.deleteMany({ where: { invoice: { supplierId: supplier.id } } });
    await prisma.vendorInvoice.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.invoiceOcrDraft.deleteMany({ where: { staffId } });
    await prisma.inventoryLot.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.supplier.deleteMany({ where: { id: supplier.id } });
  });

  const draft = await saveInvoiceOcrDraft(staffId, {
    vendorName: `Dock ${stamp}`,
    invoiceNumber,
    invoiceDate: '2026-10-15',
    totalAmount: 8,
    departmentBreakdown: { PRODUCE: 8 },
    lines: [
      {
        product_id: paid.id,
        quantity: 2,
        quantity_kind: 'units',
        unit_cost: 4,
        line_name: `Paid apples ${stamp}`,
        department: 'PRODUCE',
        line_confidence: 0.95,
        requires_approval: false,
      },
      {
        product_id: free.id,
        quantity: 1,
        quantity_kind: 'units',
        unit_cost: 0,
        line_name: `Free greens ${stamp}`,
        department: 'PRODUCE',
        line_confidence: 0.95,
        requires_approval: false,
      },
    ],
  });

  const committed = await commitInvoiceOcrReceipts({
    staffId,
    referenceId: invoiceNumber,
    draftId: draft.id,
    actorIsManager: true,
    manualReviewOverride: true,
    confirmedItems: [
      {
        product_id: paid.id,
        quantity: 2,
        quantity_kind: 'units',
        unit_cost: 4,
        line_name: `Paid apples ${stamp}`,
        department: 'PRODUCE',
        line_confidence: 0.95,
      },
      {
        product_id: free.id,
        quantity: 1,
        quantity_kind: 'units',
        unit_cost: 0,
        line_name: `Free greens ${stamp}`,
        department: 'PRODUCE',
        line_confidence: 0.95,
      },
    ],
    invoiceMeta: {
      vendorName: `Dock ${stamp}`,
      supplierId: supplier.id,
      invoiceNumber,
      invoiceDate: '2026-10-15',
      totalAmount: 8,
      departmentBreakdown: { PRODUCE: 8 },
    },
  });

  assert.equal(committed.transactionsCreated, 1);
  assert.equal(committed.receipts[0]?.unitsAdded, 2);
  assert.equal(committed.receipts[1]?.unitsAdded, 0);
  assert.equal(committed.receipts[1]?.transactionId, '');
  assert.equal(await getCurrentStock(paid.id, InventoryLocation.Retail_Floor), 2);
  assert.equal(await getCurrentStock(free.id, InventoryLocation.Retail_Floor), 0);
  assert.equal(await prisma.inventoryTransaction.count({ where: { productId: free.id } }), 0);
  const costs = await prisma.invoiceLineItem.findMany({
    where: { invoice: { supplierId: supplier.id, invoiceNumber } },
    select: { name: true, unitCost: true },
  });
  assert.deepEqual(
    costs.map((row) => row.name),
    [`Paid apples ${stamp}`]
  );
  assert.equal(costs[0]?.unitCost, 4);
  const stored = await prisma.invoiceOcrDraft.findUnique({
    where: { id: draft.id },
    select: { consumedAt: true },
  });
  assert.ok(stored?.consumedAt);
});
