import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryLocation, TransactionType } from '@prisma/client';
import { getCurrentStock, prisma } from '@/lib/domains/inventory/ledger';
import { moveRetailStock, postProductReceipt } from '@/lib/domains/inventory/stock';
import { rebuildLotsFromLedger } from '@/lib/domains/inventory/rebuildLots';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb =
  Boolean(databaseUrl) &&
  process.env.FRESHLOOP_DB_TESTS !== '0' &&
  !databaseUrl.includes('freshloop_ci');

test('ledger integration (requires DATABASE_URL)', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable (offline or wrong DATABASE_URL).');
    return;
  }

  const stamp = `test-${Date.now()}`;
  const product = await prisma.product.create({
    data: {
      name: `Integration Test Apple ${stamp}`,
      department: 'PRODUCE',
      standardCost: 1.5,
      retailPrice: 3.99,
      shelfLifeDays: 5,
    },
  });

  t.after(async () => {
    await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.markdownEvent.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });

  await postProductReceipt({
    productId: product.id,
    quantityUnits: 10,
    unitCostAtTime: 1.5,
    staffId: 'test-staff',
    referenceId: `TEST-RCV-${stamp}`,
  });

  const afterReceive = await getCurrentStock(product.id, InventoryLocation.Retail_Floor);
  assert.equal(afterReceive, 10);

  await rebuildLotsFromLedger({ productIds: [product.id] });

  const storeTotalBefore = await getCurrentStock(product.id);
  await moveRetailStock(product.id, 'rescue', 'test-staff', 4);
  const storeTotalAfterRescue = await getCurrentStock(product.id);
  assert.equal(storeTotalAfterRescue, storeTotalBefore);

  const floorAfter = await getCurrentStock(product.id, InventoryLocation.Retail_Floor);
  const kitchenAfter = await getCurrentStock(product.id, InventoryLocation.Kitchen_Prep);
  assert.equal(floorAfter, 6);
  assert.equal(kitchenAfter, 4);

  await moveRetailStock(product.id, 'waste', 'test-staff', 2);
  const storeTotalAfterWaste = await getCurrentStock(product.id);
  assert.equal(storeTotalAfterWaste, storeTotalBefore - 2);

  const wasteRows = await prisma.inventoryTransaction.count({
    where: { productId: product.id, transactionType: TransactionType.Waste },
  });
  assert.ok(wasteRows >= 1);
});
