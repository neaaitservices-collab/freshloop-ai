import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { InventoryLocation } from '@prisma/client';
import { POST as postSale } from '@/app/api/sales/route';
import { setOperationalStaffTestAuth } from '@/lib/auth/operationalStaffTestAuth';
import { executeBundleSale, getCurrentStock, prisma } from '@/lib/domains/inventory/ledger';
import { recordProductSale } from '@/lib/domains/inventory/recordSale';
import { postProductReceipt } from '@/lib/domains/inventory/stock';
import { rebuildLotsFromLedger } from '@/lib/domains/inventory/rebuildLots';
import {
  bundleQuantityFromRows,
  posSaleIdempotencyKey,
  SalePayloadConflictError,
  staffSaleIdempotencyKey,
} from '@/lib/domains/inventory/saleIdempotency';
import { salesPostBodySchema } from '@/lib/security/schemas/sales';
import { readJsonResponse } from '@/lib/testing/posWebhookHttp';

const staff = {
  id: 'sales-route-test',
  name: 'Floor',
  email: 'floor@example.com',
  role: 'FLOOR_STAFF' as const,
  position: 'Floor',
  hourlyRate: null,
};

function salesRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/sales', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('staff and POS sale keys stay distinct and ignore store ids', () => {
  assert.equal(staffSaleIdempotencyKey('mutation-01'), 'sale:staff:mutation-01');
  assert.equal(posSaleIdempotencyKey('mutation-01'), 'sale:pos:mutation-01');
  assert.notEqual(staffSaleIdempotencyKey('mutation-01'), posSaleIdempotencyKey('mutation-01'));
});

test('bundle replay quantity comes from the component rows', () => {
  const sold = bundleQuantityFromRows(
    [{ productId: 'apple', qtyChange: -6 }],
    [{ productId: 'apple', quantity: 2 }]
  );
  assert.equal(sold, 3);
});

test('sale post schema requires a clientMutationId of 8 to 128 characters', () => {
  const missing = salesPostBodySchema.safeParse({ productId: 'sku-1', quantity: 1 });
  assert.equal(missing.success, false);
  const short = salesPostBodySchema.safeParse({
    productId: 'sku-1',
    quantity: 1,
    clientMutationId: 'short',
  });
  assert.equal(short.success, false);
  const ok = salesPostBodySchema.safeParse({
    productId: 'sku-1',
    quantity: 1,
    clientMutationId: 'mutation-01',
  });
  assert.equal(ok.success, true);
});

test('POST /api/sales returns 400 for a missing or short clientMutationId', async (t) => {
  setOperationalStaffTestAuth(async () => staff);
  t.after(() => setOperationalStaffTestAuth(null));
  const missing = await readJsonResponse(
    await postSale(salesRequest({ productId: 'sku-1', quantity: 1 }))
  );
  assert.equal(missing.status, 400);
  assert.equal(missing.body.success, false);
  const short = await readJsonResponse(
    await postSale(salesRequest({ productId: 'sku-1', quantity: 1, clientMutationId: 'short' }))
  );
  assert.equal(short.status, 400);
  assert.equal(short.body.success, false);
});

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

async function stockProduct(stamp: string, units: number) {
  const product = await prisma.product.create({
    data: {
      name: `Sale Idem ${stamp}`,
      department: 'PRODUCE',
      standardCost: 1,
      retailPrice: 3,
      shelfLifeDays: 4,
    },
  });
  await postProductReceipt({
    productId: product.id,
    quantityUnits: units,
    unitCostAtTime: 1,
    staffId: 'test-staff',
    referenceId: `RCV-${stamp}`,
  });
  await rebuildLotsFromLedger({ productIds: [product.id] });
  return product;
}

test('duplicate product sale replays and does not move stock again', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `sale-idem-${Date.now()}`;
  const key = staffSaleIdempotencyKey(`sale-mut-${stamp}`);
  const product = await stockProduct(stamp, 5);
  t.after(async () => {
    await prisma.ledgerIdempotencyKey.deleteMany({ where: { key } });
    await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });

  const first = await recordProductSale({
    productId: product.id,
    quantity: 2,
    staffId: 'test-staff',
    location: 'floor',
    idempotencyKey: key,
  });
  assert.equal(first.idempotent, false);
  assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 3);

  const second = await recordProductSale({
    productId: product.id,
    quantity: 2,
    staffId: 'test-staff',
    location: 'floor',
    idempotencyKey: key,
  });
  assert.equal(second.idempotent, true);
  assert.equal(second.transactionId, first.transactionId);
  assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 3);
  assert.equal(
    await prisma.inventoryTransaction.count({
      where: { productId: product.id, transactionType: 'Sale' },
    }),
    1
  );
});

test('concurrent duplicate product sales post one ledger row', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `sale-race-${Date.now()}`;
  const key = staffSaleIdempotencyKey(`sale-race-${stamp}`);
  const product = await stockProduct(stamp, 6);
  t.after(async () => {
    await prisma.ledgerIdempotencyKey.deleteMany({ where: { key } });
    await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });
  const results = await Promise.all([
    recordProductSale({
      productId: product.id,
      quantity: 2,
      staffId: 'test-staff',
      location: 'floor',
      idempotencyKey: key,
    }),
    recordProductSale({
      productId: product.id,
      quantity: 2,
      staffId: 'test-staff',
      location: 'floor',
      idempotencyKey: key,
    }),
  ]);
  assert.equal(results.filter((row) => row.idempotent).length, 1);
  assert.equal(new Set(results.map((row) => row.transactionId)).size, 1);
  assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 4);
  assert.equal(
    await prisma.inventoryTransaction.count({
      where: { productId: product.id, transactionType: 'Sale' },
    }),
    1
  );
});

test('a reused clientMutationId with a different payload is 409', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `sale-mismatch-${Date.now()}`;
  const mutationId = `sale-http-${stamp}`;
  const product = await stockProduct(stamp, 5);
  t.after(async () => {
    setOperationalStaffTestAuth(null);
    await prisma.ledgerIdempotencyKey.deleteMany({ where: { key: staffSaleIdempotencyKey(mutationId) } });
    await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });
  setOperationalStaffTestAuth(async () => staff);
  const first = await readJsonResponse(
    await postSale(
      salesRequest({
        productId: product.id,
        quantity: 1,
        location: 'floor',
        clientMutationId: mutationId,
      })
    )
  );
  assert.equal(first.status, 200);
  assert.equal(first.body.idempotent, false);
  const mismatch = await readJsonResponse(
    await postSale(
      salesRequest({
        productId: product.id,
        quantity: 2,
        location: 'floor',
        clientMutationId: mutationId,
      })
    )
  );
  assert.equal(mismatch.status, 409);
  assert.equal(mismatch.body.success, false);
  assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 4);
  await assert.rejects(
    () =>
      recordProductSale({
        productId: product.id,
        quantity: 2,
        staffId: 'test-staff',
        location: 'floor',
        idempotencyKey: staffSaleIdempotencyKey(mutationId),
      }),
    (error: unknown) => error instanceof SalePayloadConflictError && error.statusCode === 409
  );
  await assert.rejects(
    () =>
      recordProductSale({
        productId: product.id,
        quantity: 1,
        unitPriceOverride: 9,
        staffId: 'test-staff',
        location: 'floor',
        idempotencyKey: staffSaleIdempotencyKey(mutationId),
      }),
    (error: unknown) => error instanceof SalePayloadConflictError && error.statusCode === 409
  );
  assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 4);
});

test('bundle sale replay returns the quantity sold', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `bundle-idem-${Date.now()}`;
  const key = staffSaleIdempotencyKey(`bundle-mut-${stamp}`);
  const product = await stockProduct(stamp, 10);
  const bundle = await prisma.bundle.create({
    data: {
      name: `Bundle ${stamp}`,
      bundleSku: `BDL-${stamp}`,
      bundlePrice: 4,
      items: { create: [{ productId: product.id, quantity: 2 }] },
    },
  });
  t.after(async () => {
    await prisma.ledgerIdempotencyKey.deleteMany({ where: { key } });
    await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.bundleItem.deleteMany({ where: { bundleId: bundle.id } });
    await prisma.bundle.delete({ where: { id: bundle.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });
  const first = await executeBundleSale(bundle.bundleSku, undefined, {
    staffId: 'test-staff',
    quantitySold: 3,
    idempotencyKey: key,
  });
  assert.equal(first.idempotent, false);
  assert.equal(first.quantitySold, 3);
  assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 4);
  const second = await executeBundleSale(bundle.bundleSku, undefined, {
    staffId: 'test-staff',
    quantitySold: 3,
    idempotencyKey: key,
  });
  assert.equal(second.idempotent, true);
  assert.equal(second.quantitySold, 3);
  assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 4);
  assert.equal(
    await prisma.inventoryTransaction.count({
      where: { productId: product.id, transactionType: 'POS_Sale' },
    }),
    1
  );
  await assert.rejects(
    () =>
      executeBundleSale(bundle.bundleSku, undefined, {
        staffId: 'test-staff',
        quantitySold: 1,
        idempotencyKey: key,
      }),
    (error: unknown) => error instanceof SalePayloadConflictError && error.statusCode === 409
  );
  assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 4);
});
