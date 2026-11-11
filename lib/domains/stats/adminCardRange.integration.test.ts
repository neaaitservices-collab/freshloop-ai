import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryLocation, TransactionType } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { adminDashboardWindow } from '@/lib/domains/stats/adminDashboardWindow';
import { getStoreStats } from '@/lib/domains/stats/storeStats';
import { formatCardRangeLabel, last30StoreDays, torontoRange } from '@/lib/domains/stats/storeTime';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

test('card totals follow the Toronto range, including DST edges and an empty window', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `card-range-${Date.now()}`;
  const product = await prisma.product.create({
    data: {
      name: `Card range ${stamp}`,
      department: 'PRODUCE',
      standardCost: 2,
      retailPrice: 10,
      shelfLifeDays: 4,
      unitType: 'UNIT',
    },
  });
  const spring = torontoRange('2026-03-08', '2026-03-08');
  t.after(async () => {
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });

  await prisma.inventoryTransaction.createMany({
    data: [
      {
        productId: product.id,
        staffId: 'before',
        qtyChange: 1,
        transactionType: TransactionType.Rescue,
        fromLocation: InventoryLocation.Retail_Floor,
        toLocation: InventoryLocation.Kitchen_Prep,
        unitCostAtTime: 2,
        timestamp: new Date(spring.startUtc.getTime() - 1),
      },
      {
        productId: product.id,
        staffId: 'start',
        qtyChange: 1,
        transactionType: TransactionType.Rescue,
        fromLocation: InventoryLocation.Retail_Floor,
        toLocation: InventoryLocation.Kitchen_Prep,
        unitCostAtTime: 2,
        timestamp: spring.startUtc,
      },
      {
        productId: product.id,
        staffId: 'inside',
        qtyChange: 2,
        transactionType: TransactionType.Waste,
        fromLocation: InventoryLocation.Retail_Floor,
        toLocation: InventoryLocation.Waste_Bin,
        unitCostAtTime: 2,
        timestamp: new Date(spring.endUtc.getTime() - 1),
      },
      {
        productId: product.id,
        staffId: 'end',
        qtyChange: 1,
        transactionType: TransactionType.Rescue,
        fromLocation: InventoryLocation.Retail_Floor,
        toLocation: InventoryLocation.Kitchen_Prep,
        unitCostAtTime: 2,
        timestamp: spring.endUtc,
      },
    ],
  });

  const day = await getStoreStats(spring);
  assert.equal(day.rescuedValue, 10);
  assert.equal(day.lostValue, 20);
  assert.equal(day.wasteReductionPct, 33.3);
  assert.equal(day.cardRangeLabel, 'Mar 8');

  const empty = await getStoreStats(torontoRange('2099-01-01', '2099-01-01'));
  assert.equal(empty.rescuedValue, 0);
  assert.equal(empty.lostValue, 0);
  assert.equal(empty.wasteReductionPct, null);

  const rolling = last30StoreDays();
  const fallback = await getStoreStats();
  assert.equal(fallback.cardRangeLabel, formatCardRangeLabel(rolling.from, rolling.to));
  assert.equal(fallback.inventoryValue >= 0, true);
});

test('the admin dashboard window has one outcome day per Toronto date', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const fixed = adminDashboardWindow(new Date('2026-06-15T16:00:00.000Z'));
  const stats = await getStoreStats(fixed.range);
  assert.equal(stats.outcomeDays.length, fixed.dayCount);
  assert.equal(stats.outcomeDays.length, 30);
  assert.equal(stats.cardRangeLabel, formatCardRangeLabel(fixed.from, fixed.to));
  assert.equal(Number.isFinite(stats.inventoryValue), true);
});

test('an old custom range does not replace the last 7 revenue days', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `revenue-days-${Date.now()}`;
  const product = await prisma.product.create({
    data: {
      name: `Revenue days ${stamp}`,
      department: 'PRODUCE',
      standardCost: 2,
      retailPrice: 10,
      shelfLifeDays: 4,
      unitType: 'UNIT',
    },
  });
  const lastYear = torontoRange('2024-06-15', '2024-06-15');
  t.after(async () => {
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });
  const before = await getStoreStats(lastYear);
  await prisma.inventoryTransaction.createMany({
    data: [
      {
        productId: product.id,
        staffId: 'recent',
        qtyChange: 1,
        transactionType: TransactionType.Rescue,
        fromLocation: InventoryLocation.Retail_Floor,
        toLocation: InventoryLocation.Kitchen_Prep,
        unitCostAtTime: 2,
        timestamp: new Date(),
      },
      {
        productId: product.id,
        staffId: 'last-year',
        qtyChange: 3,
        transactionType: TransactionType.Rescue,
        fromLocation: InventoryLocation.Retail_Floor,
        toLocation: InventoryLocation.Kitchen_Prep,
        unitCostAtTime: 2,
        timestamp: new Date('2024-06-15T16:00:00.000Z'),
      },
    ],
  });
  const after = await getStoreStats(lastYear);
  assert.equal(after.revenueDays.length, 7);
  assert.equal(Number((after.rescuedValue - before.rescuedValue).toFixed(2)), 30);
  const beforeRevenue = before.revenueDays.reduce((sum, day) => sum + day.recovered, 0);
  const afterRevenue = after.revenueDays.reduce((sum, day) => sum + day.recovered, 0);
  assert.equal(Number((afterRevenue - beforeRevenue).toFixed(2)), 10);
});
