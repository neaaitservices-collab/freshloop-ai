import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST as postSale } from '@/app/api/sales/route';
import { setOperationalStaffTestAuth } from '@/lib/auth/operationalStaffTestAuth';
import { AuthError } from '@/lib/auth/session';
import { prisma } from '@/lib/domains/inventory/ledger';
import { postProductReceipt } from '@/lib/domains/inventory/stock';
import { rebuildLotsFromLedger } from '@/lib/domains/inventory/rebuildLots';
import { getCurrentStock } from '@/lib/domains/inventory/ledger';
import { InventoryLocation } from '@prisma/client';
import { salesPostBodySchema } from '@/lib/security/schemas/sales';
import { readJsonResponse } from '@/lib/testing/posWebhookHttp';
import { staffSaleIdempotencyKey } from '@/lib/domains/inventory/saleIdempotency';

const staff = {
  id: 'floor-sale-test',
  name: 'Floor',
  email: 'floor-sale@example.com',
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

test('floor sale quantity matches the sale schema bounds', () => {
  const base = { productId: 'sku-1', location: 'floor' as const, clientMutationId: 'mutation-01' };
  assert.equal(salesPostBodySchema.safeParse({ ...base, quantity: 1.5 }).success, true);
  assert.equal(salesPostBodySchema.safeParse({ ...base, quantity: 0 }).success, false);
  assert.equal(salesPostBodySchema.safeParse({ ...base, quantity: -1 }).success, false);
  assert.equal(salesPostBodySchema.safeParse({ ...base, quantity: 1_000_001 }).success, false);
  assert.equal(salesPostBodySchema.safeParse({ ...base, location: 'backroom' }).success, false);
});

test('POST /api/sales rejects an anonymous floor sale', async (t) => {
  // node:test cannot call NextAuth headers(). A missing session throws this same AuthError.
  setOperationalStaffTestAuth(async () => {
    throw new AuthError('Unauthorized — sign in required.', 401);
  });
  t.after(() => setOperationalStaffTestAuth(null));
  const response = await readJsonResponse(
    await postSale(
      salesRequest({
        productId: 'sku-1',
        quantity: 1,
        location: 'floor',
        clientMutationId: 'mutation-01',
      })
    )
  );
  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
});

test('POST /api/sales rejects a zero, negative, or oversized quantity', async (t) => {
  setOperationalStaffTestAuth(async () => staff);
  t.after(() => setOperationalStaffTestAuth(null));
  for (const quantity of [0, -2, 1_000_001]) {
    const response = await readJsonResponse(
      await postSale(
        salesRequest({
          productId: 'sku-1',
          quantity,
          location: 'floor',
          clientMutationId: 'mutation-01',
        })
      )
    );
    assert.equal(response.status, 400, `quantity ${quantity}`);
    assert.equal(response.body.success, false);
  }
});

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

test('POST /api/sales rejects a store id outside the session', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  setOperationalStaffTestAuth(async () => staff);
  t.after(() => setOperationalStaffTestAuth(null));
  const response = await readJsonResponse(
    await postSale(
      salesRequest({
        productId: 'sku-1',
        quantity: 1,
        location: 'floor',
        storeId: 'store-outside-this-session',
        clientMutationId: 'mutation-store-01',
      })
    )
  );
  assert.equal(response.status, 403);
  assert.equal(response.body.success, false);
});

test('floor sale posts once, replays, and rejects a changed quantity', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  setOperationalStaffTestAuth(async () => staff);
  const stamp = `floor-sale-${Date.now()}`;
  const mutationId = `floor-sale-${stamp}`;
  const product = await prisma.product.create({
    data: {
      name: `Floor Sale ${stamp}`,
      department: 'PRODUCE',
      standardCost: 1,
      retailPrice: 3,
      shelfLifeDays: 4,
    },
  });
  t.after(async () => {
    setOperationalStaffTestAuth(null);
    await prisma.ledgerIdempotencyKey.deleteMany({ where: { key: staffSaleIdempotencyKey(mutationId) } });
    await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });
  await postProductReceipt({
    productId: product.id,
    quantityUnits: 6,
    unitCostAtTime: 1,
    staffId: 'test-staff',
    referenceId: `RCV-${stamp}`,
  });
  await rebuildLotsFromLedger({ productIds: [product.id] });

  const body = {
    productId: product.id,
    quantity: 2,
    location: 'floor' as const,
    clientMutationId: mutationId,
  };
  const [first, second] = await Promise.all([
    readJsonResponse(await postSale(salesRequest(body))),
    readJsonResponse(await postSale(salesRequest(body))),
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const firstSale = first.body.sale as { transactionId?: string } | undefined;
  const secondSale = second.body.sale as { transactionId?: string } | undefined;
  assert.equal(firstSale?.transactionId, secondSale?.transactionId);
  assert.equal(
    [first.body.idempotent, second.body.idempotent].filter((flag) => flag === true).length,
    1
  );
  assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 4);
  assert.equal(
    await prisma.inventoryTransaction.count({
      where: { productId: product.id, transactionType: 'Sale' },
    }),
    1
  );
  const level = first.body.level as { onHand?: number } | undefined;
  assert.equal(level?.onHand, 4);

  const missing = await readJsonResponse(
    await postSale(
      salesRequest({
        productId: 'missing-product-id',
        quantity: 1,
        location: 'floor',
        clientMutationId: `missing-${stamp}`,
      })
    )
  );
  assert.equal(missing.status, 404);

  const mismatch = await readJsonResponse(
    await postSale(salesRequest({ ...body, quantity: 1 }))
  );
  assert.equal(mismatch.status, 409);
  assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 4);
});
