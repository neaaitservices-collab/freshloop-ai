import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryLocation } from '@prisma/client';
import { getCurrentStock, prisma } from '@/lib/domains/inventory/ledger';
import { recordProductSale } from '@/lib/domains/inventory/recordSale';
import { postProductReceipt } from '@/lib/domains/inventory/stock';
import { rebuildLotsFromLedger } from '@/lib/domains/inventory/rebuildLots';
import { saleIdempotencyKey } from '@/lib/domains/inventory/saleIdempotency';
import { salesPostBodySchema } from '@/lib/security/schemas/sales';

test('sale post requires a clientMutationId of 8 to 128 characters', () => {
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

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

test('duplicate product sale replays and does not move stock again', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `sale-idem-${Date.now()}`;
  const mutationId = `sale-mut-${stamp}`;
  const key = saleIdempotencyKey('default', mutationId);
  const product = await prisma.product.create({
    data: {
      name: `Sale Idem ${stamp}`,
      department: 'PRODUCE',
      standardCost: 1,
      retailPrice: 3,
      shelfLifeDays: 4,
    },
  });
  t.after(async () => {
    await prisma.ledgerIdempotencyKey.deleteMany({ where: { key } });
    await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });
  await postProductReceipt({
    productId: product.id,
    quantityUnits: 5,
    unitCostAtTime: 1,
    staffId: 'test-staff',
    referenceId: `RCV-${stamp}`,
  });
  await rebuildLotsFromLedger({ productIds: [product.id] });

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
