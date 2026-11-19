import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryLocation } from '@prisma/client';
import { getCurrentStock, InventoryLedgerError, prisma } from '@/lib/domains/inventory/ledger';
import {
  moveKitchenPrepToWaste,
  moveRetailStock,
  postProductReceipt,
} from '@/lib/domains/inventory/stock';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';

/** True only for the CI database named freshloop_ci. Any other DATABASE_URL skips. */
function isFreshloopCiTestDatabase(url: string, dbTestsFlag: string | undefined): boolean {
  if (!url.trim() || dbTestsFlag === '0') return false;
  try {
    const database = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
    return database === 'freshloop_ci';
  } catch {
    return false;
  }
}

const hasCiDb = isFreshloopCiTestDatabase(databaseUrl, process.env.FRESHLOOP_DB_TESTS);

function assertOneOverOnHand(results: PromiseSettledResult<unknown>): void {
  assert.equal(results.status, 'rejected');
  if (results.status !== 'rejected') return;
  assert.ok(results.reason instanceof InventoryLedgerError);
  assert.equal((results.reason as InventoryLedgerError).code, 'QTY_OVER_ON_HAND');
}

test(
  'concurrent transfers and wastes cannot both pass the on-hand check',
  { skip: !hasCiDb },
  async (t) => {
    try {
      await prisma.$connect();
    } catch {
      t.skip('Database unreachable.');
      return;
    }

    const stamp = `lock-${Date.now()}`;
    const product = await prisma.product.create({
      data: {
        name: `Lock Apple ${stamp}`,
        department: 'PRODUCE',
        standardCost: 1,
        retailPrice: 2,
        shelfLifeDays: 5,
      },
    });
    t.after(async () => {
      await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
      await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
      await prisma.product.delete({ where: { id: product.id } });
    });

    await postProductReceipt({
      productId: product.id,
      quantityUnits: 5,
      unitCostAtTime: 1,
      staffId: 'test-staff',
      referenceId: `LOCK-RCV-${stamp}`,
    });

    const wastes = await Promise.allSettled([
      moveRetailStock(product.id, 'waste', 'test-staff', 3),
      moveRetailStock(product.id, 'waste', 'test-staff', 3),
    ]);
    const wasteWins = wastes.filter((result) => result.status === 'fulfilled');
    const wasteLoss = wastes.find((result) => result.status === 'rejected');
    assert.equal(wasteWins.length, 1);
    assert.ok(wasteLoss);
    if (wasteLoss) assertOneOverOnHand(wasteLoss);
    assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 2);

    await postProductReceipt({
      productId: product.id,
      quantityUnits: 4,
      unitCostAtTime: 1,
      staffId: 'test-staff',
      referenceId: `LOCK-RCV2-${stamp}`,
    });
    const transfers = await Promise.allSettled([
      moveRetailStock(product.id, 'rescue', 'test-staff', 4),
      moveRetailStock(product.id, 'rescue', 'test-staff', 4),
    ]);
    const transferWins = transfers.filter((result) => result.status === 'fulfilled');
    const transferLoss = transfers.find((result) => result.status === 'rejected');
    assert.equal(transferWins.length, 1);
    assert.ok(transferLoss);
    if (transferLoss) assertOneOverOnHand(transferLoss);
    assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), 2);
    assert.equal(await getCurrentStock(product.id, InventoryLocation.Kitchen_Prep), 4);

    const prepWastes = await Promise.allSettled([
      moveKitchenPrepToWaste(product.id, 'test-staff', 3),
      moveKitchenPrepToWaste(product.id, 'test-staff', 3),
    ]);
    const prepWins = prepWastes.filter((result) => result.status === 'fulfilled');
    const prepLoss = prepWastes.find((result) => result.status === 'rejected');
    assert.equal(prepWins.length, 1);
    assert.ok(prepLoss);
    if (prepLoss) assertOneOverOnHand(prepLoss);
    assert.equal(await getCurrentStock(product.id, InventoryLocation.Kitchen_Prep), 1);
  }
);
