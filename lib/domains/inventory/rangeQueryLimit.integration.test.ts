import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { InventoryLocation, TransactionType } from '@prisma/client';
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

test('the chart does not show a row cap', () => {
  const chart = readFileSync('components/features/admin/RescueOutcomeChart.tsx', 'utf8');
  const dashboard = readFileSync('components/features/admin/AdminDashboard.tsx', 'utf8');
  const stats = readFileSync('lib/domains/stats/storeStats.ts', 'utf8');
  assert.equal(chart.includes('rowLimitHint'), false);
  assert.equal(chart.includes('Showing latest'), false);
  assert.equal(dashboard.includes('showingLatestLabel'), false);
  assert.equal(stats.includes('take: limit'), false);
});

test('SQL totals still include every transfer', { skip: !hasDb }, async (t) => {
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

  const chart = await loadRangeChart(range);
  const beforeUnits = beforeChart.totals.reduce((sum, day) => sum + day.rescueUnits, 0);
  const afterUnits = chart.totals.reduce((sum, day) => sum + day.rescueUnits, 0);
  assert.equal(Number((afterUnits - beforeUnits).toFixed(2)), 7.5);
  assert.equal(chart.totalCount - beforeChart.totalCount, 4);
});
