import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryLocation, TransactionType } from '@prisma/client';
import {
  calculateRealTimeWastePct,
  prisma,
  VOLUMETRIC_SCRAP_REF_PREFIX,
} from '@/lib/domains/inventory/ledger';
import { getAdminPeriodFigures, getStoreStats, invalidateStoreStats } from '@/lib/domains/stats/storeStats';
import { torontoRange } from '@/lib/domains/stats/storeTime';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

test('period figures match rescue totals, scraps, and sales without inventory', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const range = torontoRange('2031-04-04', '2031-04-04');
  const stamp = `period-figures-${Date.now()}`;
  const product = await prisma.product.create({
    data: {
      name: `Period figures ${stamp}`,
      department: 'PRODUCE',
      standardCost: 2,
      retailPrice: 10,
      shelfLifeDays: 4,
      unitType: 'UNIT',
    },
  });
  t.after(async () => {
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
    invalidateStoreStats();
  });

  const wasteOptions = {
    startDate: range.startUtc,
    endDate: new Date(range.endUtc.getTime() - 1),
  };
  invalidateStoreStats();
  const [beforePeriod, beforeStats, beforeWaste] = await Promise.all([
    getAdminPeriodFigures(range),
    getStoreStats(range),
    calculateRealTimeWastePct(wasteOptions),
  ]);

  const inside = new Date(range.startUtc.getTime() + 60 * 60 * 1000);
  await prisma.inventoryTransaction.createMany({
    data: [
      {
        productId: product.id,
        staffId: 'period-rescue',
        qtyChange: 2,
        transactionType: TransactionType.Rescue,
        fromLocation: InventoryLocation.Retail_Floor,
        toLocation: InventoryLocation.Kitchen_Prep,
        unitCostAtTime: 2,
        timestamp: inside,
      },
      {
        productId: product.id,
        staffId: 'period-waste',
        qtyChange: -1,
        transactionType: TransactionType.Waste,
        fromLocation: InventoryLocation.Retail_Floor,
        toLocation: InventoryLocation.Waste_Bin,
        unitCostAtTime: 2,
        timestamp: inside,
      },
      {
        productId: product.id,
        staffId: 'period-scrap',
        qtyChange: 0,
        transactionType: TransactionType.Waste,
        fromLocation: InventoryLocation.Kitchen_Prep,
        toLocation: InventoryLocation.Waste_Bin,
        unitCostAtTime: 0,
        referenceId: `${VOLUMETRIC_SCRAP_REF_PREFIX}-${stamp}`,
        notes: 'volumetric scrap',
        scrapBucketCount: 2,
        timestamp: inside,
      },
      {
        productId: product.id,
        staffId: 'period-sale',
        qtyChange: -3,
        transactionType: TransactionType.POS_Sale,
        fromLocation: InventoryLocation.Retail_Floor,
        toLocation: InventoryLocation.Customer_Out,
        unitCostAtTime: 2,
        realizedLineRevenue: 12.34,
        timestamp: inside,
      },
      {
        productId: product.id,
        staffId: 'period-legacy-sale',
        qtyChange: -1,
        transactionType: TransactionType.Sale,
        fromLocation: InventoryLocation.Retail_Floor,
        toLocation: InventoryLocation.Customer_Out,
        unitCostAtTime: 9,
        realizedLineRevenue: null,
        timestamp: inside,
      },
    ],
  });

  invalidateStoreStats();
  const [period, stats, waste] = await Promise.all([
    getAdminPeriodFigures(range),
    getStoreStats(range),
    calculateRealTimeWastePct(wasteOptions),
  ]);

  assert.equal(Number((period.rescuedValue - beforePeriod.rescuedValue).toFixed(2)), 20);
  assert.equal(Number((period.lostValue - beforePeriod.lostValue).toFixed(2)), 10);
  assert.equal(period.rescuedValue, stats.rescuedValue);
  assert.equal(period.lostValue, stats.lostValue);
  assert.equal(stats.rescuedValue, beforeStats.rescuedValue + 20);
  assert.equal(
    Number((waste.volumetricScrapBucketsCount - beforeWaste.volumetricScrapBucketsCount).toFixed(2)),
    2
  );
  assert.equal(
    Number((period.scrapBuckets - beforePeriod.scrapBuckets).toFixed(2)),
    Number((waste.volumetricScrapBucketsCount - beforeWaste.volumetricScrapBucketsCount).toFixed(2))
  );
  assert.equal(
    Number((period.scrapDollars - beforePeriod.scrapDollars).toFixed(2)),
    Number((waste.volumetricScrapValue - beforeWaste.volumetricScrapValue).toFixed(2))
  );
  assert.equal(Number((period.sales - beforePeriod.sales).toFixed(2)), 12.34);
  assert.equal(
    Number((waste.grossSalesRevenue - beforeWaste.grossSalesRevenue).toFixed(2)),
    12.34
  );
  assert.equal('inventoryValue' in period, false);
  assert.equal(stats.inventoryValue, beforeStats.inventoryValue);

  await prisma.inventoryTransaction.create({
    data: {
      productId: product.id,
      staffId: 'outside',
      qtyChange: 5,
      transactionType: TransactionType.Rescue,
      fromLocation: InventoryLocation.Retail_Floor,
      toLocation: InventoryLocation.Kitchen_Prep,
      unitCostAtTime: 2,
      timestamp: new Date(range.endUtc.getTime() + 1000),
    },
  });
  invalidateStoreStats();
  const outside = await getAdminPeriodFigures(range);
  assert.equal(outside.rescuedValue, period.rescuedValue);
});
