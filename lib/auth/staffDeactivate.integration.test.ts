import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '@/lib/db/prisma';
import { deactivateStaff } from '@/lib/auth/staffAccount';
import { staffAccountDb } from '@/lib/auth/staffAccountStore';
import { staffUserFromRow } from '@/lib/auth/staffSnapshot';

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

test(
  'deactivating a staff user keeps their inventory transactions',
  { skip: !hasCiDb },
  async (t) => {
    try {
      await prisma.$connect();
    } catch {
      t.skip('Database unreachable.');
      return;
    }

    const stamp = `staff-off-${Date.now()}`;
    const product = await prisma.product.create({
      data: {
        name: `Staff Off Apple ${stamp}`,
        department: 'PRODUCE',
        standardCost: 1.5,
        retailPrice: 3.5,
        shelfLifeDays: 5,
      },
    });
    const owner = await prisma.user.create({
      data: {
        name: `Owner ${stamp}`,
        email: `owner-${stamp}@freshloop.test`,
        position: 'Owner',
        role: 'ADMIN',
        passwordHash: 'hash',
      },
    });
    const floor = await prisma.user.create({
      data: {
        name: `Floor ${stamp}`,
        email: `floor-${stamp}@freshloop.test`,
        position: 'Produce floor',
        role: 'FLOOR_STAFF',
        passwordHash: 'hash',
        credentialVersion: 4,
      },
    });
    const transaction = await prisma.inventoryTransaction.create({
      data: {
        productId: product.id,
        staffId: floor.id,
        qtyChange: -2,
        transactionType: 'Waste',
        fromLocation: 'Retail_Floor',
        toLocation: 'Waste_Bin',
        unitCostAtTime: 1.5,
        notes: stamp,
      },
    });

    t.after(async () => {
      await prisma.inventoryTransaction.deleteMany({ where: { id: transaction.id } });
      await prisma.product.deleteMany({ where: { id: product.id } });
      await prisma.user.deleteMany({ where: { id: { in: [owner.id, floor.id] } } });
    });

    await deactivateStaff(
      staffAccountDb,
      {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: 'ADMIN',
        position: 'Owner',
        hourlyRate: null,
      },
      floor.id
    );

    const kept = await prisma.inventoryTransaction.findUnique({ where: { id: transaction.id } });
    assert.ok(kept);
    assert.equal(kept.staffId, floor.id);
    assert.equal(kept.qtyChange, -2);
    assert.equal(kept.notes, stamp);

    const row = await prisma.user.findUnique({
      where: { id: floor.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
        hourlyRate: true,
        passwordHash: true,
        credentialVersion: true,
        deactivatedAt: true,
      },
    });
    assert.ok(row);
    assert.ok(row.deactivatedAt);
    assert.equal(row.credentialVersion, 5);
    assert.equal(staffUserFromRow(row), null);
  }
);
