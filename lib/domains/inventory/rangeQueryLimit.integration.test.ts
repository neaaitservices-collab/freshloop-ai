import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { InventoryLocation, TransactionType } from '@prisma/client';
import { getKitchenInbox } from '@/lib/domains/inventory/kitchenInbox';
import { prisma } from '@/lib/domains/inventory/ledger';
import { loadRangeChart } from '@/lib/domains/stats/storeStats';
import { torontoRange } from '@/lib/domains/stats/storeTime';

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

test('the chart does not show a row cap, and the inbox count is the full total', () => {
  const chart = readFileSync('components/features/admin/RescueOutcomeChart.tsx', 'utf8');
  const dashboard = readFileSync('components/features/admin/AdminDashboard.tsx', 'utf8');
  const stats = readFileSync('lib/domains/stats/storeStats.ts', 'utf8');
  const inbox = readFileSync('lib/domains/inventory/kitchenInbox.ts', 'utf8');
  const floor = readFileSync('components/features/kitchen/KitchenFloorInbox.tsx', 'utf8');
  assert.equal(chart.includes('rowLimitHint'), false);
  assert.equal(chart.includes('Showing latest'), false);
  assert.equal(dashboard.includes('showingLatestLabel'), false);
  assert.equal(stats.includes('take: limit'), false);
  assert.match(inbox, /orderBy: \[\{ timestamp: 'desc' \}, \{ id: 'desc' \}\]/);
  assert.match(floor, /\{totalCount\} item/);
  assert.match(floor, /total > rows\.length/);
});

test('range list is capped and SQL totals still include every transfer', { skip: !hasDb }, async (t) => {
  if (!(await connectOrSkip(t))) return;
  const stamp = `range-cap-${Date.now()}`;
  const product = await prisma.product.create({
    data: {
      name: `Range cap ${stamp}`,
      department: 'PRODUCE',
      standardCost: 2,
      retailPrice: 5,
      shelfLifeDays: 4,
      unitType: 'UNIT',
    },
  });
  const range = torontoRange('2026-06-02', '2026-06-02');
  const beforeChart = await loadRangeChart(range);
  const quantities = [4, 1.5, 2];
  await Promise.all(
    quantities.map((qty, index) =>
      prisma.inventoryTransaction.create({
        data: {
          productId: product.id,
          staffId: index === 0 ? 'latest-sender' : 'older-sender',
          qtyChange: qty,
          transactionType: TransactionType.Rescue,
          fromLocation: InventoryLocation.Retail_Floor,
          toLocation: InventoryLocation.Kitchen_Prep,
          unitCostAtTime: 2,
          timestamp: new Date(`2026-06-02T1${5 + index}:00:00.000Z`),
        },
      })
    )
  );
  await prisma.inventoryTransaction.create({
    data: {
      productId: product.id,
      staffId: 'negative-leg',
      qtyChange: -4,
      transactionType: TransactionType.Rescue,
      fromLocation: InventoryLocation.Retail_Floor,
      toLocation: InventoryLocation.Kitchen_Prep,
      unitCostAtTime: 2,
      timestamp: new Date('2026-06-02T18:30:00.000Z'),
    },
  });
  t.after(async () => {
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });

  const page = await getKitchenInbox(24, range, 2);
  assert.equal(page.items.length, 2);
  assert.equal(page.truncated, true);
  assert.equal(page.totalCount, 3);
  assert.equal(page.totalQty, 7.5);
  assert.equal(page.productTotals.length, 1);
  assert.equal(page.productTotals[0]?.qtyReceived, 7.5);
  const listedOnly = page.items.reduce((sum, row) => sum + row.qtyReceived, 0);
  assert.ok(listedOnly < page.totalQty);

  const chart = await loadRangeChart(range);
  const beforeUnits = beforeChart.totals.reduce((sum, day) => sum + day.rescueUnits, 0);
  const afterUnits = chart.totals.reduce((sum, day) => sum + day.rescueUnits, 0);
  assert.equal(Number((afterUnits - beforeUnits).toFixed(2)), 7.5);
  assert.equal(chart.totalCount - beforeChart.totalCount, 4);
});

test('equal timestamps list the higher id first', { skip: !hasDb }, async (t) => {
  if (!(await connectOrSkip(t))) return;
  const stamp = `range-tie-${Date.now()}`;
  const product = await prisma.product.create({
    data: {
      name: `Range tie ${stamp}`,
      department: 'PRODUCE',
      standardCost: 1,
      retailPrice: 2,
      shelfLifeDays: 3,
      unitType: 'UNIT',
    },
  });
  const when = new Date('2099-03-04T16:00:00.000Z');
  const first = await prisma.inventoryTransaction.create({
    data: {
      productId: product.id,
      staffId: 'tie-a',
      qtyChange: 1,
      transactionType: TransactionType.Rescue,
      fromLocation: InventoryLocation.Retail_Floor,
      toLocation: InventoryLocation.Kitchen_Prep,
      unitCostAtTime: 1,
      timestamp: when,
    },
  });
  const second = await prisma.inventoryTransaction.create({
    data: {
      productId: product.id,
      staffId: 'tie-b',
      qtyChange: 1,
      transactionType: TransactionType.Rescue,
      fromLocation: InventoryLocation.Retail_Floor,
      toLocation: InventoryLocation.Kitchen_Prep,
      unitCostAtTime: 1,
      timestamp: when,
    },
  });
  t.after(async () => {
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });

  const page = await getKitchenInbox(24, torontoRange('2099-03-04', '2099-03-04'), 10);
  const ids = page.items.filter((row) => row.productId === product.id).map((row) => row.id);
  const expected = [first.id, second.id].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  assert.deepEqual(ids, expected);
});
