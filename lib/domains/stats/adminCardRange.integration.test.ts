import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryLocation, TransactionType } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
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
