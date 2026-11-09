import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { InventoryLocation } from '@prisma/client';
import { InventoryLedgerError, getCurrentStock, prisma } from '@/lib/domains/inventory/ledger';
import {
  ManufacturingOperationConflictError,
  executeManufacturingBatch,
  manufacturingBatchReferenceId,
} from '@/lib/domains/manufacturing/executeBatch';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

async function connectOrSkip(t: { skip: (message?: string) => void }): Promise<boolean> {
  if (!hasDb) {
    t.skip('Database unreachable.');
    return false;
  }
  try {
    await prisma.$connect();
    return true;
  } catch {
    t.skip('Database unreachable.');
    return false;
  }
}

async function seedKitchenBatch(stamp: string, onHand: number) {
  const ingredient = await prisma.product.create({
    data: {
      name: `Mfg Ing ${stamp}`,
      department: 'PRODUCE',
      standardCost: 2,
      retailPrice: 4,
      shelfLifeDays: 5,
      unitType: 'UNIT',
    },
  });
  const output = await prisma.product.create({
    data: {
      name: `Mfg Out ${stamp}`,
      department: 'DELI_KITCHEN',
      standardCost: 1,
      retailPrice: 10,
      shelfLifeDays: 3,
      unitType: 'UNIT',
      isManufactured: true,
    },
  });
  const recipe = await prisma.recipe.create({
    data: {
      name: `Mfg Recipe ${stamp}`,
      outputProductId: output.id,
      yieldPortions: 4,
      targetRetailPrice: 10,
      laborHours: 0,
      packagingCostPerUnit: 0,
      instructions: '',
      bomLines: {
        create: {
          ingredientProductId: ingredient.id,
          quantityRequired: 2,
          unit: 'UNIT',
          allowVariance: true,
        },
      },
    },
  });
  await prisma.inventoryTransaction.create({
    data: {
      productId: ingredient.id,
      staffId: 'test-staff',
      qtyChange: onHand,
      transactionType: 'Receive',
      fromLocation: InventoryLocation.External_Vendor,
      toLocation: InventoryLocation.Kitchen_Prep,
      unitCostAtTime: 2,
      referenceId: `SEED-${stamp}`,
    },
  });
  await prisma.inventoryLot.create({
    data: {
      productId: ingredient.id,
      location: InventoryLocation.Kitchen_Prep,
      qtyRemaining: onHand,
      unitCostAtTime: 2,
    },
  });
  return { ingredient, output, recipe };
}

async function removeKitchenBatch(
  seeded: Awaited<ReturnType<typeof seedKitchenBatch>>,
  operationIds: string[]
) {
  const productIds = [seeded.ingredient.id, seeded.output.id];
  await prisma.manufacturingOperation.deleteMany({ where: { id: { in: operationIds } } });
  await prisma.inventoryLot.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.inventoryTransaction.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.recipeBOM.deleteMany({ where: { recipeId: seeded.recipe.id } });
  await prisma.recipe.delete({ where: { id: seeded.recipe.id } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
}

function runBatch(
  recipeId: string,
  operationId: string,
  batchOutput: number,
  staffId = 'test-staff'
) {
  return executeManufacturingBatch({
    operationId,
    staffId,
    staffRole: 'DELI_CHEF',
    recipeId,
    batchOutput,
    enforceStockCheck: true,
  });
}

test('same manufacturing operation replays one batch', { skip: !hasDb }, async (t) => {
  if (!(await connectOrSkip(t))) return;
  const stamp = `mfg-seq-${Date.now()}`;
  const seeded = await seedKitchenBatch(stamp, 10);
  const operationId = randomUUID();
  t.after(() => removeKitchenBatch(seeded, [operationId]));

  const first = await runBatch(seeded.recipe.id, operationId, 4);
  const second = await runBatch(seeded.recipe.id, operationId, 4);

  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.deepEqual(second.result, first.result);
  assert.equal(first.result.batch_reference_id, manufacturingBatchReferenceId(operationId));
  assert.equal(first.result.unit_output_cost, 1);
  assert.equal(first.result.total_batch_cost, 4);
  assert.equal(
    await prisma.inventoryTransaction.count({
      where: { referenceId: first.result.batch_reference_id },
    }),
    2
  );
  assert.equal(
    await getCurrentStock(seeded.ingredient.id, InventoryLocation.Kitchen_Prep),
    8
  );
  assert.equal(await getCurrentStock(seeded.output.id, InventoryLocation.Deli_Grab_N_Go), 4);
  assert.equal(await prisma.manufacturingOperation.count({ where: { id: operationId } }), 1);
});

test('concurrent manufacturing retries post one batch', { skip: !hasDb }, async (t) => {
  if (!(await connectOrSkip(t))) return;
  const stamp = `mfg-race-${Date.now()}`;
  const seeded = await seedKitchenBatch(stamp, 2);
  const operationId = randomUUID();
  t.after(() => removeKitchenBatch(seeded, [operationId]));

  const results = await Promise.all([
    runBatch(seeded.recipe.id, operationId, 4),
    runBatch(seeded.recipe.id, operationId, 4),
  ]);

  const originals = results.filter((row) => !row.idempotent);
  const replays = results.filter((row) => row.idempotent);
  assert.equal(originals.length, 1);
  assert.equal(replays.length, 1);
  assert.equal(replays[0]?.result.batch_reference_id, originals[0]?.result.batch_reference_id);
  assert.equal(replays[0]?.result.output_transaction.id, originals[0]?.result.output_transaction.id);
  assert.equal(
    await prisma.inventoryTransaction.count({
      where: { referenceId: manufacturingBatchReferenceId(operationId) },
    }),
    2
  );
  assert.equal(
    await getCurrentStock(seeded.ingredient.id, InventoryLocation.Kitchen_Prep),
    0
  );
  assert.equal(await getCurrentStock(seeded.output.id, InventoryLocation.Deli_Grab_N_Go), 4);
});

test('same manufacturing id with a different payload conflicts', { skip: !hasDb }, async (t) => {
  if (!(await connectOrSkip(t))) return;
  const stamp = `mfg-conflict-${Date.now()}`;
  const seeded = await seedKitchenBatch(stamp, 20);
  const operationId = randomUUID();
  t.after(() => removeKitchenBatch(seeded, [operationId]));

  const first = await runBatch(seeded.recipe.id, operationId, 4);
  await assert.rejects(
    () => runBatch(seeded.recipe.id, operationId, 8),
    (error: unknown) => error instanceof ManufacturingOperationConflictError
  );
  assert.equal(
    await getCurrentStock(seeded.ingredient.id, InventoryLocation.Kitchen_Prep),
    18
  );
  assert.equal(await getCurrentStock(seeded.output.id, InventoryLocation.Deli_Grab_N_Go), 4);
  assert.equal(first.result.actual_batch_output, 4);
  assert.equal(await prisma.manufacturingOperation.count({ where: { id: operationId } }), 1);
});

test('failed manufacturing batch rolls back so the same id can retry', { skip: !hasDb }, async (t) => {
  if (!(await connectOrSkip(t))) return;
  const stamp = `mfg-retry-${Date.now()}`;
  const seeded = await seedKitchenBatch(stamp, 10);
  const operationId = randomUUID();
  t.after(() => removeKitchenBatch(seeded, [operationId]));

  await assert.rejects(
    () => runBatch(seeded.recipe.id, operationId, 40),
    (error: unknown) =>
      error instanceof InventoryLedgerError && error.code === 'INSUFFICIENT_KITCHEN_PREP_STOCK'
  );
  assert.equal(await prisma.manufacturingOperation.count({ where: { id: operationId } }), 0);
  assert.equal(
    await prisma.inventoryTransaction.count({
      where: { referenceId: manufacturingBatchReferenceId(operationId) },
    }),
    0
  );
  assert.equal(
    await getCurrentStock(seeded.ingredient.id, InventoryLocation.Kitchen_Prep),
    10
  );

  const retried = await runBatch(seeded.recipe.id, operationId, 4);
  assert.equal(retried.idempotent, false);
  assert.equal(
    await getCurrentStock(seeded.ingredient.id, InventoryLocation.Kitchen_Prep),
    8
  );
  assert.equal(await prisma.manufacturingOperation.count({ where: { id: operationId } }), 1);
});

test('another staff id cannot replay a manufacturing operation', { skip: !hasDb }, async (t) => {
  if (!(await connectOrSkip(t))) return;
  const stamp = `mfg-owner-${Date.now()}`;
  const seeded = await seedKitchenBatch(stamp, 10);
  const operationId = randomUUID();
  t.after(() => removeKitchenBatch(seeded, [operationId]));

  const first = await runBatch(seeded.recipe.id, operationId, 4, 'staff-a');
  const sameUser = await runBatch(seeded.recipe.id, operationId, 4, 'staff-a');
  assert.equal(sameUser.idempotent, true);
  assert.equal(sameUser.result.executed_by_staff_id, 'staff-a');
  assert.deepEqual(sameUser.result, first.result);

  await assert.rejects(
    () => runBatch(seeded.recipe.id, operationId, 4, 'staff-b'),
    (error: unknown) => error instanceof ManufacturingOperationConflictError
  );
  assert.equal(
    await prisma.inventoryTransaction.count({
      where: { referenceId: first.result.batch_reference_id },
    }),
    2
  );
  assert.equal(
    await getCurrentStock(seeded.ingredient.id, InventoryLocation.Kitchen_Prep),
    8
  );
  assert.equal(await getCurrentStock(seeded.output.id, InventoryLocation.Deli_Grab_N_Go), 4);
});

test('distinct manufacturing ids post separate identical batches', { skip: !hasDb }, async (t) => {
  if (!(await connectOrSkip(t))) return;
  const stamp = `mfg-distinct-${Date.now()}`;
  const seeded = await seedKitchenBatch(stamp, 10);
  const firstId = randomUUID();
  const secondId = randomUUID();
  t.after(() => removeKitchenBatch(seeded, [firstId, secondId]));

  const first = await runBatch(seeded.recipe.id, firstId, 4);
  const second = await runBatch(seeded.recipe.id, secondId, 4);
  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, false);
  assert.notEqual(first.result.batch_reference_id, second.result.batch_reference_id);
  assert.equal(
    await prisma.inventoryTransaction.count({
      where: {
        referenceId: { in: [first.result.batch_reference_id, second.result.batch_reference_id] },
      },
    }),
    4
  );
  assert.equal(
    await getCurrentStock(seeded.ingredient.id, InventoryLocation.Kitchen_Prep),
    6
  );
  assert.equal(await getCurrentStock(seeded.output.id, InventoryLocation.Deli_Grab_N_Go), 8);
});
