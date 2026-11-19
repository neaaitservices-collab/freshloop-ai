import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryLocation } from '@prisma/client';
import { NextRequest } from 'next/server';
import { POST as postMove } from '@/app/api/inventory/move/route';
import { setOperationalStaffTestAuth } from '@/lib/auth/operationalStaffTestAuth';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';
import { getCurrentStock, InventoryLedgerError, prisma } from '@/lib/domains/inventory/ledger';
import { rebuildLotsFromLedger } from '@/lib/domains/inventory/rebuildLots';
import { explicitMoveQuantity, postProductReceipt } from '@/lib/domains/inventory/stock';
import { inventoryMoveBodySchema } from '@/lib/security/schemas/inventory';
import { readJsonResponse } from '@/lib/testing/posWebhookHttp';

const staff: AuthSessionUser = {
  id: 'inventory-move-http',
  name: 'Admin',
  email: 'inventory-move-http@example.com',
  role: 'ADMIN',
  position: 'Admin',
  hourlyRate: null,
};

function moveRequest(body: unknown) {
  return new NextRequest('http://localhost/api/inventory/move', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('move quantity is required and is not capped to on-hand', () => {
  assert.equal(
    inventoryMoveBodySchema.safeParse({ productId: 'prod_1', action: 'waste' }).success,
    false
  );
  assert.equal(
    inventoryMoveBodySchema.safeParse({ productId: 'prod_1', action: 'rescue', quantity: '' }).success,
    false
  );
  assert.equal(
    inventoryMoveBodySchema.safeParse({ productId: 'prod_1', action: 'markdown' }).success,
    true
  );
  assert.equal(explicitMoveQuantity(4, 4, 'floor'), 4);
  assert.throws(
    () => explicitMoveQuantity(9, 4, 'floor'),
    (error: unknown) => {
      assert.ok(error instanceof InventoryLedgerError);
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /more than the 4 on the floor/);
      return true;
    }
  );
  assert.throws(
    () => explicitMoveQuantity(0, 4, 'production'),
    (error: unknown) => {
      assert.ok(error instanceof InventoryLedgerError);
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

test('POST /api/inventory/move rejects a missing or blank quantity', async (t) => {
  setOperationalStaffTestAuth(async () => staff);
  t.after(() => setOperationalStaffTestAuth(null));
  for (const body of [
    { productId: 'prod_1', action: 'rescue' },
    { productId: 'prod_1', action: 'waste', quantity: '' },
    { productId: 'prod_1', action: 'kitchen_waste', quantity: ' ' },
  ]) {
    const response = await readJsonResponse(await postMove(moveRequest(body)));
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(response.body.success, false);
    assert.equal(typeof response.body.error, 'string');
    assert.match(String(response.body.error), /quantity/i);
  }
});

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

test('POST /api/inventory/move rejects over-on-hand and posts a real quantity', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  setOperationalStaffTestAuth(async () => staff);
  const stamp = `move-http-${Date.now()}`;
  const product = await prisma.product.create({
    data: {
      name: `Move HTTP ${stamp}`,
      department: 'PRODUCE',
      standardCost: 2.8,
      retailPrice: 4.69,
      shelfLifeDays: 5,
    },
  });
  t.after(async () => {
    setOperationalStaffTestAuth(null);
    await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });
  await postProductReceipt({
    productId: product.id,
    quantityUnits: 4,
    unitCostAtTime: 2.8,
    staffId: staff.id,
    referenceId: `RCV-${stamp}`,
  });
  await rebuildLotsFromLedger({ productIds: [product.id] });
  const written = () =>
    prisma.inventoryTransaction.count({ where: { productId: product.id } });
  const before = await written();

  for (const body of [
    { productId: product.id, action: 'waste' },
    { productId: product.id, action: 'waste', quantity: '' },
    { productId: product.id, action: 'rescue', quantity: 9 },
  ]) {
    const response = await readJsonResponse(await postMove(moveRequest(body)));
    const expected = body.quantity === 9 ? 409 : 400;
    assert.equal(response.status, expected, JSON.stringify({ body, response: response.body }));
    assert.equal(response.body.success, false);
    if (expected === 409) {
      assert.match(String(response.body.error), /more than the 4 on the floor/);
    }
    assert.equal(await written(), before);
  }
  const floor = await getCurrentStock(product.id, InventoryLocation.Retail_Floor);
  assert.equal(floor, 4);

  const posted = await readJsonResponse(
    await postMove(moveRequest({ productId: product.id, action: 'waste', quantity: 1 }))
  );
  assert.equal(posted.status, 200, JSON.stringify(posted.body));
  assert.equal(posted.body.success, true);
  assert.equal(posted.body.units, 1);
  assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 3);
  assert.equal(await written(), before + 1);
});
