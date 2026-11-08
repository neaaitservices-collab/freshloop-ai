import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryLocation } from '@prisma/client';
import { getCurrentStock, prisma } from '@/lib/domains/inventory/ledger';
import { postReceivingLogToInventory } from '@/lib/domains/receiving/receivingLogPost';
import { DELIVERY_PAYLOAD_CONFLICT_ERROR } from '@/lib/domains/receiving/deliveryIdentity';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02';
const ID_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccc03';

function line(id: string, overrides: Record<string, unknown> = {}) {
  return {
    itemName: 'Sheet Apples',
    casesReceived: 1,
    caseCost: 8,
    packSize: 4,
    splitFactor: 1,
    retailUnit: 'units' as const,
    marginMode: '40' as const,
    currentRetailPrice: 3,
    externalLogId: id,
    ...overrides,
  };
}

test('delivery UUIDs post, retry, conflict, and stay distinct', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = Date.now();
  const name = `Delivery Apple ${stamp}`;
  t.after(async () => {
    await prisma.receivingDelivery.deleteMany({ where: { id: { in: [ID_A, ID_B, ID_C] } } });
    await prisma.ledgerIdempotencyKey.deleteMany({
      where: { key: { in: [`recv:${ID_A}`, `recv:${ID_B}`, `recv:${ID_C}`, 'recv:sheet-row-2'] } },
    });
    await prisma.inventoryLot.deleteMany({ where: { product: { name } } });
    await prisma.inventoryTransaction.deleteMany({ where: { product: { name } } });
    await prisma.product.deleteMany({ where: { name } });
  });

  await prisma.ledgerIdempotencyKey.create({ data: { key: 'recv:sheet-row-2' } });

  const samePositionFirst = await postReceivingLogToInventory(
    line(ID_A, { itemName: name }),
    'test-staff',
    null
  );
  const samePositionSecond = await postReceivingLogToInventory(
    line(ID_B, { itemName: name }),
    'test-staff',
    null
  );
  assert.equal(samePositionFirst.stock.posted, true);
  assert.equal(samePositionSecond.stock.posted, true);
  if (!samePositionFirst.stock.posted || !samePositionSecond.stock.posted) return;

  const priced = await postReceivingLogToInventory(
    line(ID_A, { itemName: name, currentRetailPrice: 9 }),
    'test-staff',
    null
  );
  assert.equal(priced.stock.posted, true);
  if (priced.stock.posted) assert.equal(priced.stock.idempotent, true);

  const retry = await postReceivingLogToInventory(line(ID_A, { itemName: name }), 'test-staff', null);
  assert.equal(retry.stock.posted, true);
  if (retry.stock.posted) {
    assert.equal(retry.stock.idempotent, true);
    assert.equal(retry.stock.unitsAdded, samePositionFirst.stock.unitsAdded);
    assert.equal(retry.stock.productId, samePositionFirst.stock.productId);
  }

  const conflict = await postReceivingLogToInventory(
    line(ID_A, { itemName: name, caseCost: 20 }),
    'test-staff',
    null
  );
  assert.equal(conflict.stock.posted, false);
  if (!conflict.stock.posted) {
    assert.equal(conflict.stock.conflict, true);
    assert.equal(conflict.stock.reason, DELIVERY_PAYLOAD_CONFLICT_ERROR);
  }

  const [left, right] = await Promise.all([
    postReceivingLogToInventory(line(ID_C, { itemName: name }), 'test-staff', null),
    postReceivingLogToInventory(line(ID_C, { itemName: name }), 'test-staff', null),
  ]);
  const writes = [left, right].filter((row) => row.stock.posted && row.stock.idempotent !== true);
  const replays = [left, right].filter((row) => row.stock.posted && row.stock.idempotent === true);
  assert.equal(writes.length, 1);
  assert.equal(replays.length, 1);

  const productId = samePositionFirst.stock.productId;
  const onHand = await getCurrentStock(productId, InventoryLocation.Retail_Floor);
  assert.equal(onHand, 12);
  const legacy = await prisma.ledgerIdempotencyKey.findUnique({ where: { key: 'recv:sheet-row-2' } });
  assert.ok(legacy);
});
