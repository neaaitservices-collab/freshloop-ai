import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prisma } from '@/lib/domains/inventory/ledger';
import { postReceipt } from '@/lib/domains/inventory/stock';
import { commitConfirmedVoiceItems } from '@/lib/domains/inventory/voiceCommit';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

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
  const seedId = crypto.randomUUID();
  t.after(async () => {
    await prisma.receivingDelivery.deleteMany({ where: { id: seedId } });
    await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.ledgerIdempotencyKey.deleteMany({ where: { key: { contains: stamp } } });
    await prisma.ledgerIdempotencyKey.deleteMany({ where: { key: `recv:${seedId}` } });
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
    externalLogId: seedId,
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
