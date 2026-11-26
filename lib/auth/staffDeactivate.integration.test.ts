import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '@/lib/db/prisma';
import { deactivateStaff, saveStaffProfile } from '@/lib/auth/staffAccount';
import { createPasswordResetToken } from '@/lib/auth/passwordReset';
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

test(
  'concurrent owner demotion and deactivation leave one owner',
  { skip: !hasCiDb },
  async (t) => {
    try {
      await prisma.$connect();
    } catch {
      t.skip('Database unreachable.');
      return;
    }

    const created: string[] = [];
    const parked = await prisma.user.findMany({
      where: { role: 'ADMIN', deactivatedAt: null },
      select: { id: true },
    });
    if (parked.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: parked.map((row) => row.id) } },
        data: { deactivatedAt: new Date('2026-11-26T00:00:00.000Z') },
      });
    }
    t.after(async () => {
      if (parked.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: parked.map((row) => row.id) } },
          data: { deactivatedAt: null },
        });
      }
      if (created.length === 0) return;
      await prisma.user.deleteMany({ where: { id: { in: created } } });
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const stamp = `owners-${Date.now()}-${attempt}`;
      const ownerA = await prisma.user.create({
        data: {
          name: `Owner A ${stamp}`,
          email: `owner-a-${stamp}@freshloop.test`,
          position: 'Owner',
          role: 'ADMIN',
          passwordHash: 'hash',
        },
      });
      const ownerB = await prisma.user.create({
        data: {
          name: `Owner B ${stamp}`,
          email: `owner-b-${stamp}@freshloop.test`,
          position: 'Owner',
          role: 'ADMIN',
          passwordHash: 'hash',
        },
      });
      created.push(ownerA.id, ownerB.id);
      const intruders = await prisma.user.findMany({
        where: {
          role: 'ADMIN',
          deactivatedAt: null,
          NOT: { id: { in: [ownerA.id, ownerB.id] } },
        },
        select: { id: true },
      });
      if (intruders.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: intruders.map((row) => row.id) } },
          data: { deactivatedAt: new Date('2026-11-26T00:00:00.000Z') },
        });
        parked.push(...intruders);
      }

      const results = await Promise.allSettled([
        saveStaffProfile(
          staffAccountDb,
          {
            id: ownerA.id,
            name: ownerA.name,
            email: ownerA.email,
            role: 'ADMIN',
            position: 'Owner',
            hourlyRate: null,
          },
          ownerB.id,
          { name: ownerB.name, email: ownerB.email, role: 'STORE_MANAGER' }
        ),
        deactivateStaff(
          staffAccountDb,
          {
            id: ownerB.id,
            name: ownerB.name,
            email: ownerB.email,
            role: 'ADMIN',
            position: 'Owner',
            hourlyRate: null,
          },
          ownerA.id
        ),
      ]);

      const activeOwners = await prisma.user.count({
        where: {
          role: 'ADMIN',
          deactivatedAt: null,
          id: { in: [ownerA.id, ownerB.id] },
        },
      });
      const detail = results
        .map((result) => (result.status === 'rejected' ? String(result.reason?.message ?? result.reason) : 'ok'))
        .join(' | ');
      assert.equal(activeOwners, 1, `attempt ${attempt}: ${detail}`);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1, detail);
      assert.equal(results.filter((result) => result.status === 'rejected').length, 1, detail);
      await prisma.user.deleteMany({ where: { id: { in: [ownerA.id, ownerB.id] } } });
    }
  }
);

test(
  'a deactivated staff member does not receive a password reset link',
  { skip: !hasCiDb },
  async (t) => {
    try {
      await prisma.$connect();
    } catch {
      t.skip('Database unreachable.');
      return;
    }

    const stamp = `reset-${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        name: `Inactive ${stamp}`,
        email: `inactive-${stamp}@freshloop.test`,
        position: 'Produce floor',
        role: 'FLOOR_STAFF',
        passwordHash: 'hash',
        deactivatedAt: new Date(),
      },
    });
    t.after(async () => {
      await prisma.verificationToken.deleteMany({
        where: { identifier: `password-reset:${user.email}` },
      });
      await prisma.user.deleteMany({ where: { id: user.id } });
    });

    const token = await createPasswordResetToken(user.email);
    assert.equal(token, null);
    const links = await prisma.verificationToken.count({
      where: { identifier: `password-reset:${user.email}` },
    });
    assert.equal(links, 0);
  }
);
