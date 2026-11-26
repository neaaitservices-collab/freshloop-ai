import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { InventoryLedgerError, prisma } from '@/lib/domains/inventory/ledger';
import { postInvoiceReceiptBatch } from '@/lib/domains/receiving/invoiceReceiptBatch';
import { RECEIPT_COLLISION_REASON, type ReceivingLogPostInput } from '@/lib/domains/receiving/receivingLogPost';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

function line(overrides: Partial<ReceivingLogPostInput>): ReceivingLogPostInput {
  return {
    itemName: 'RED CABBAGE CASE',
    supplierCode: 'CAB4C',
    casesReceived: 1,
    caseCost: 22.75,
    packSize: 1,
    splitFactor: 1,
    retailUnit: 'units',
    marginMode: '40',
    currentRetailPrice: 0,
    department: 'PRODUCE',
    externalLogId: crypto.randomUUID(),
    ...overrides,
  };
}

async function cleanup(productIds: string[], supplierIds: string[]) {
  if (productIds.length > 0) {
    const deliveries = await prisma.receivingDelivery.findMany({
      where: { catalogProductId: { in: productIds } },
      select: { id: true },
    });
    const deliveryIds = deliveries.map((row) => row.id);
    await prisma.ledgerIdempotencyKey.deleteMany({
      where: { key: { in: deliveryIds.map((id) => `recv:${id}`) } },
    });
    await prisma.receivingDelivery.deleteMany({ where: { id: { in: deliveryIds } } });
    await prisma.inventoryLot.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.supplierProductMatch.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  }
  if (supplierIds.length > 0) {
    await prisma.supplierInvoiceDocument.deleteMany({ where: { supplierId: { in: supplierIds } } });
    await prisma.supplier.deleteMany({ where: { id: { in: supplierIds } } });
  }
}

test('an existing name with no barcode is reused instead of copied', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `cabbage-${Date.now()}`;
  const cabbage = await prisma.product.create({
    data: {
      name: `RED CABBAGE CASE ${stamp}`,
      department: 'PRODUCE',
      supplier: 'Old dock',
      standardCost: 3,
      shelfLifeDays: 7,
    },
  });
  t.after(() => cleanup([cabbage.id], []));
  const posted = await prisma.$transaction((tx) =>
    postInvoiceReceiptBatch(
      tx,
      [
        line({
          itemName: `RED CABBAGE CASE ${stamp}`,
          supplierCode: `CAB${stamp.slice(-4).toUpperCase()}`,
          caseRetailPrice: 40,
        }),
      ],
      { staffId: 'staff-review', supplierName: 'Tony Deodato', supplierId: null }
    )
  );
  const update = posted.catalogUpdates.find((row) => row.id === cabbage.id);
  assert.ok(update);
  assert.equal('barcode' in update.data, false);
  assert.equal(update.data.caseRetailPrice, 40);
  assert.equal(posted.postedRows[0]?.stock.posted, true);
  if (posted.postedRows[0]?.stock.posted) {
    assert.equal(posted.postedRows[0].stock.productId, cabbage.id);
  }
  const rows = await prisma.product.findMany({ where: { name: `RED CABBAGE CASE ${stamp}` } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.barcode, null);
  assert.equal(rows[0]?.id, cabbage.id);
});

test('another supplier barcode is not the product this code posts to', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `basil-${Date.now()}`;
  const other = await prisma.supplier.create({ data: { name: `Other Market ${stamp}` } });
  const ours = await prisma.supplier.create({ data: { name: `Deodato ${stamp}` } });
  const basil = await prisma.product.create({
    data: {
      name: `West Coast Basil ${stamp}`,
      barcode: `BAS${stamp.slice(-6).toUpperCase()}`,
      department: 'PRODUCE',
      supplier: `Other Market ${stamp}`,
      standardCost: 1,
      shelfLifeDays: 7,
    },
  });
  const code = basil.barcode ?? '';
  t.after(() => cleanup([basil.id], [other.id, ours.id]));
  await assert.rejects(
    () =>
      prisma.$transaction((tx) =>
        postInvoiceReceiptBatch(tx, [line({ itemName: `BAG BASIL ${stamp}`, supplierCode: code })], {
          staffId: 'staff-review',
          supplierName: `Deodato ${stamp}`,
          supplierId: ours.id,
        })
      ),
    (error: unknown) => {
      assert.ok(error instanceof InventoryLedgerError);
      assert.equal(error.statusCode, 409);
      assert.equal(error.message, RECEIPT_COLLISION_REASON);
      assert.match(error.message, /Confirm again/);
      const results = (error.details as { results?: { itemName?: string }[] } | undefined)?.results;
      assert.ok(Array.isArray(results));
      assert.equal(results?.[0]?.itemName, `BAG BASIL ${stamp}`);
      return true;
    }
  );
  const kept = await prisma.product.findUnique({ where: { id: basil.id } });
  assert.equal(kept?.supplier, `Other Market ${stamp}`);
  assert.equal(kept?.standardCost, 1);
  assert.equal(kept?.barcode, code);
  assert.equal(await prisma.inventoryTransaction.count({ where: { productId: basil.id } }), 0);
});

test('a manufactured product with the same code returns a line-level 409', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `made-${Date.now()}`;
  const code = `MFG${stamp.slice(-6).toUpperCase()}`;
  const made = await prisma.product.create({
    data: {
      name: `Kitchen basil ${stamp}`,
      barcode: code,
      department: 'PRODUCE',
      isManufactured: true,
      standardCost: 4,
      shelfLifeDays: 7,
    },
  });
  t.after(() => cleanup([made.id], []));
  const itemName = `BAG BASIL ${stamp}`;
  await assert.rejects(
    () =>
      prisma.$transaction((tx) =>
        postInvoiceReceiptBatch(tx, [line({ itemName, supplierCode: code, externalLogId: crypto.randomUUID() })], {
          staffId: 'staff-review',
          supplierName: 'Tony Deodato',
          supplierId: null,
        })
      ),
    (error: unknown) => {
      assert.ok(error instanceof InventoryLedgerError);
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, 'DELIVERY_CONFLICT');
      assert.equal(error.message, RECEIPT_COLLISION_REASON);
      const results = (error.details as { committed?: boolean; results?: { itemName?: string; stock?: { posted?: boolean } }[] })
        .results;
      assert.equal(Array.isArray(results), true);
      assert.equal(results?.[0]?.itemName, itemName);
      assert.equal(results?.[0]?.stock?.posted, false);
      return true;
    }
  );
  const kept = await prisma.product.findUnique({ where: { id: made.id } });
  assert.equal(kept?.isManufactured, true);
  assert.equal(kept?.barcode, code);
  assert.equal(kept?.standardCost, 4);
  assert.equal(await prisma.product.count({ where: { name: itemName, isManufactured: false } }), 0);
});
