import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import {
  LEGACY_DEMO_FUSION_FINGERPRINTS,
  listFusionRecipes,
} from '@/lib/domains/kitchen/recipeFusionStore';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

test('a uuid demo fusion row is not listed', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const demo = LEGACY_DEMO_FUSION_FINGERPRINTS[0];
  assert.ok(demo);
  const stamp = `fusion-list-${Date.now()}`;
  const demoRow = await prisma.recipeFusion.create({
    data: {
      recipeName: demo.recipeName,
      category: 'Parfait / Dessert',
      ingredientsUsed: demo.ingredientsUsed as unknown as Prisma.InputJsonValue,
      estimatedYield: '16 Individual Dessert Tubs (10 oz)',
      estimatedCost: demo.estimatedCost,
      targetRetailPrice: 6.99,
      grossMarginPct: 65.9,
      instructions: 'Demo card that was saved under a uuid.',
    },
  });
  const liveRow = await prisma.recipeFusion.create({
    data: {
      recipeName: `Herb soup ${stamp}`,
      category: 'Soup',
      ingredientsUsed: [
        { name: 'Basil', quantity: '1 bunch', department: 'PRODUCE', estimatedCost: 1.25 },
      ],
      estimatedYield: '4 cups',
      estimatedCost: 1.25,
      targetRetailPrice: 6,
      grossMarginPct: 70,
      instructions: 'Chop.',
    },
  });
  const sameName = await prisma.recipeFusion.create({
    data: {
      recipeName: demo.recipeName,
      category: 'Parfait / Dessert',
      ingredientsUsed: [
        { name: 'Real apples', quantity: '2 lbs', department: 'PRODUCE', estimatedCost: 4 },
      ],
      estimatedYield: '8 cups',
      estimatedCost: 4,
      targetRetailPrice: 5,
      grossMarginPct: 40,
      instructions: 'A real recipe that only shares the demo name.',
    },
  });

  t.after(async () => {
    await prisma.recipeFusion.deleteMany({
      where: { id: { in: [demoRow.id, liveRow.id, sameName.id] } },
    });
  });

  assert.equal(demoRow.id.includes('rec-mock-'), false);
  const listed = await listFusionRecipes(500);
  const ids = new Set(listed.map((row) => row.id));
  assert.equal(ids.has(demoRow.id), false);
  assert.equal(ids.has(liveRow.id), true);
  assert.equal(ids.has(sameName.id), true);
});
