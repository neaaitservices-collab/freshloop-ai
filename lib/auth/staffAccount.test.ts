import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  deactivateStaff,
  reactivateStaff,
  saveStaffProfile,
  StaffAccountError,
  type StaffAccountDb,
  type StaffRecord,
} from '@/lib/auth/staffAccount';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';
import { activeStaffDirectoryWhere } from '@/lib/domains/auth/staffDirectory';
import { staffRoleSchema } from '@/lib/security/schemas/staff';
import { houseForRole } from '@/lib/utils/positions';
import { ROLES, type RoleName } from '@/lib/utils/roles';

function actor(role: RoleName, id = `actor-${role}`): AuthSessionUser {
  return {
    id,
    name: role,
    email: `${role.toLowerCase()}@freshloop.test`,
    role,
    position: 'Staff',
    hourlyRate: null,
  };
}

function person(overrides: Partial<StaffRecord> = {}): StaffRecord {
  return {
    id: 'floor-1',
    name: 'Floor Staff',
    email: 'floor@freshloop.test',
    position: 'Produce floor',
    role: 'FLOOR_STAFF',
    credentialVersion: 2,
    deactivatedAt: null,
    ...overrides,
  };
}

function memory(initial: StaffRecord[]) {
  const users = initial.map((user) => ({ ...user }));
  const ledger = users.map((user) => ({ id: `tx-${user.id}`, staffId: user.id, qtyChange: -3 }));
  const ledgerSnapshot = JSON.stringify(ledger);
  let writes = 0;
  const db: StaffAccountDb = {
    async findById(id) {
      const found = users.find((user) => user.id === id);
      return found ? { ...found } : null;
    },
    async countActiveOwners(exceptId) {
      return users.filter(
        (user) => user.role === 'ADMIN' && user.deactivatedAt == null && user.id !== exceptId
      ).length;
    },
    async passwordHashFor() {
      return 'hash';
    },
    async update(id, data) {
      const user = users.find((row) => row.id === id);
      if (!user) throw new Error(`missing ${id}`);
      writes += 1;
      if (data.name !== undefined) user.name = data.name;
      if (data.email !== undefined) user.email = data.email;
      if (data.position !== undefined) user.position = data.position;
      if (data.role !== undefined) user.role = data.role;
      if (data.deactivatedAt !== undefined) user.deactivatedAt = data.deactivatedAt;
      if (data.credentialVersionIncrement) user.credentialVersion += 1;
      return { ...user };
    },
  };
  return {
    db,
    users,
    ledger,
    writes: () => writes,
    ledgerIntact: () => JSON.stringify(ledger) === ledgerSnapshot,
  };
}

const profile = {
  name: 'Floor Staff',
  email: 'floor@freshloop.test',
};

test('an owner can change a role and the ledger rows stay', async () => {
  const store = memory([person(), person({ id: 'owner-1', role: 'ADMIN', email: 'owner@freshloop.test', position: 'Owner' })]);
  const saved = await saveStaffProfile(store.db, actor('ADMIN', 'owner-1'), 'floor-1', {
    ...profile,
    role: 'DELI_CHEF',
  });
  assert.equal(saved.role, 'DELI_CHEF');
  assert.equal(saved.position, 'Deli production');
  assert.equal(saved.credentialVersion, 2);
  const renamed = await saveStaffProfile(store.db, actor('ADMIN', 'owner-1'), 'floor-1', {
    name: 'Floor Staff',
    email: 'floor.moved@freshloop.test',
    role: 'DELI_CHEF',
  });
  assert.equal(renamed.credentialVersion, 3);
  assert.equal(renamed.email, 'floor.moved@freshloop.test');
  assert.equal(store.ledgerIntact(), true);
  assert.equal(store.users.find((user) => user.id === 'floor-1')?.role, 'DELI_CHEF');
  assert.equal(store.ledgerIntact(), true);
  assert.equal(store.ledger.some((row) => row.staffId === 'floor-1'), true);
});

test('role edits are forbidden for every role except owner', async () => {
  for (const role of ROLES) {
    if (role === 'ADMIN') continue;
    const store = memory([person()]);
    await assert.rejects(
      () => saveStaffProfile(store.db, actor(role), 'floor-1', { ...profile, role: 'DELI_CHEF' }),
      (error: unknown) => {
        assert.ok(error instanceof StaffAccountError);
        assert.equal(error.status, 403);
        assert.match(error.message, /owner/);
        return true;
      }
    );
    assert.equal(store.writes(), 0);
    assert.equal(store.users[0]?.role, 'FLOOR_STAFF');
    assert.equal(store.ledgerIntact(), true);
  }
});

test('a store manager cannot promote someone by sending an owner position', async () => {
  const store = memory([person()]);
  await assert.rejects(
    () =>
      saveStaffProfile(store.db, actor('STORE_MANAGER'), 'floor-1', {
        ...profile,
        position: 'Owner',
      }),
    (error: unknown) => {
      assert.ok(error instanceof StaffAccountError);
      assert.equal(error.status, 403);
      return true;
    }
  );
  assert.equal(store.users[0]?.role, 'FLOOR_STAFF');
});

test('the last owner cannot be demoted', async () => {
  const store = memory([
    person({ id: 'owner-1', role: 'ADMIN', position: 'Owner', email: 'owner@freshloop.test' }),
  ]);
  await assert.rejects(
    () =>
      saveStaffProfile(store.db, actor('ADMIN', 'other-owner'), 'owner-1', {
        name: 'Owner',
        email: 'owner@freshloop.test',
        role: 'STORE_MANAGER',
      }),
    (error: unknown) => {
      assert.ok(error instanceof StaffAccountError);
      assert.equal(error.status, 400);
      assert.match(error.message, /at least one owner/);
      return true;
    }
  );
  assert.equal(store.writes(), 0);
  assert.equal(store.users[0]?.role, 'ADMIN');
});

test('an owner cannot demote themselves even when another owner exists', async () => {
  const store = memory([
    person({ id: 'owner-1', role: 'ADMIN', position: 'Owner', email: 'a@freshloop.test' }),
    person({ id: 'owner-2', role: 'ADMIN', position: 'Owner', email: 'b@freshloop.test' }),
  ]);
  await assert.rejects(
    () =>
      saveStaffProfile(store.db, actor('ADMIN', 'owner-1'), 'owner-1', {
        name: 'Owner',
        email: 'a@freshloop.test',
        role: 'FLOOR_STAFF',
      }),
    (error: unknown) => {
      assert.ok(error instanceof StaffAccountError);
      assert.equal(error.status, 400);
      assert.match(error.message, /own owner role/);
      return true;
    }
  );
  assert.equal(store.writes(), 0);
  const demoted = await saveStaffProfile(store.db, actor('ADMIN', 'owner-2'), 'owner-1', {
    name: 'Owner',
    email: 'a@freshloop.test',
    role: 'STORE_MANAGER',
  });
  assert.equal(demoted.role, 'STORE_MANAGER');
  assert.equal(demoted.position, 'Store manager');
});

test('nobody can deactivate themselves or the last owner', async () => {
  const alone = memory([
    person({ id: 'owner-1', role: 'ADMIN', position: 'Owner', email: 'owner@freshloop.test' }),
    person({
      id: 'owner-gone',
      role: 'ADMIN',
      position: 'Owner',
      email: 'gone@freshloop.test',
      deactivatedAt: new Date('2026-11-01T00:00:00.000Z'),
    }),
  ]);
  await assert.rejects(
    () => deactivateStaff(alone.db, actor('ADMIN', 'owner-1'), 'owner-1'),
    (error: unknown) => {
      assert.ok(error instanceof StaffAccountError);
      assert.equal(error.status, 400);
      assert.match(error.message, /your own account/);
      return true;
    }
  );
  assert.equal(alone.writes(), 0);
  assert.equal(alone.users[0]?.deactivatedAt, null);

  await assert.rejects(
    () => deactivateStaff(alone.db, actor('ADMIN', 'owner-2'), 'owner-1'),
    (error: unknown) => {
      assert.ok(error instanceof StaffAccountError);
      assert.equal(error.status, 400);
      assert.match(error.message, /at least one owner/);
      return true;
    }
  );
  assert.equal(alone.writes(), 0);
  assert.equal(alone.ledgerIntact(), true);
});

test('deactivate keeps the staff row and ledger attribution and blocks that login', async () => {
  const store = memory([
    person(),
    person({ id: 'owner-1', role: 'ADMIN', position: 'Owner', email: 'owner@freshloop.test' }),
  ]);
  const when = new Date('2026-11-26T16:00:00.000Z');
  const saved = await deactivateStaff(store.db, actor('ADMIN', 'owner-1'), 'floor-1', when);
  assert.equal(saved.deactivatedAt?.toISOString(), when.toISOString());
  assert.equal(saved.credentialVersion, 3);
  const row = store.users.find((user) => user.id === 'floor-1');
  assert.ok(row);
  assert.equal(row.deactivatedAt?.toISOString(), when.toISOString());
  assert.equal(store.users.length, 2);
  assert.equal(store.ledgerIntact(), true);
  assert.deepEqual(
    store.ledger.find((entry) => entry.staffId === 'floor-1'),
    { id: 'tx-floor-1', staffId: 'floor-1', qtyChange: -3 }
  );

  const again = await deactivateStaff(store.db, actor('ADMIN', 'owner-1'), 'floor-1', when);
  assert.equal(again.credentialVersion, 3);
  assert.equal(store.writes(), 1);

  for (const role of ROLES) {
    if (role === 'ADMIN') continue;
    await assert.rejects(
      () => deactivateStaff(store.db, actor(role), 'floor-1'),
      (error: unknown) => {
        assert.ok(error instanceof StaffAccountError);
        assert.equal(error.status, 403);
        return true;
      }
    );
  }

  const back = await reactivateStaff(store.db, actor('ADMIN', 'owner-1'), 'floor-1');
  assert.equal(back.deactivatedAt, null);
  assert.equal(back.credentialVersion, 3);
  await assert.rejects(
    () => reactivateStaff(store.db, actor('STORE_MANAGER'), 'floor-1'),
    (error: unknown) => {
      assert.ok(error instanceof StaffAccountError);
      assert.equal(error.status, 403);
      return true;
    }
  );
  assert.equal(store.ledgerIntact(), true);
});

test('the active roster filter hides deactivated staff', () => {
  assert.deepEqual(activeStaffDirectoryWhere(false), { deactivatedAt: null });
  assert.equal(activeStaffDirectoryWhere(true), undefined);
  assert.equal(houseForRole('FLOOR_STAFF'), 'Front');
  assert.equal(houseForRole('RECEIVING_CLERK'), 'Back');
  assert.equal(houseForRole('DELI_CHEF'), 'Back');
  assert.equal(staffRoleSchema.safeParse('OWNER').success, false);
  assert.equal(staffRoleSchema.parse('ADMIN'), 'ADMIN');
});

test('deactivation is an update of deactivated_at, not a staff or ledger delete', () => {
  const migration = readFileSync(
    'prisma/migrations/20261126170000_staff_deactivated_at/migration.sql',
    'utf8'
  );
  assert.match(migration, /ADD COLUMN "deactivated_at" TIMESTAMP\(3\)/);
  assert.match(
    migration,
    /CREATE INDEX "staff_users_deactivated_at_idx" ON "staff_users"\("deactivated_at"\)/
  );
  assert.equal(/\b(DROP|DELETE|UPDATE)\b/i.test(migration), false);

  const store = readFileSync('lib/auth/staffAccountStore.ts', 'utf8');
  const route = readFileSync('app/api/users/[id]/route.ts', 'utf8');
  const signIn = readFileSync('auth.ts', 'utf8');
  assert.equal(store.includes('inventoryTransaction'), false);
  assert.equal(store.includes('.delete'), false);
  assert.match(store, /deactivatedAt/);
  assert.match(store, /credentialVersion: \{ increment: 1 \}/);
  assert.match(route, /deactivateStaff/);
  assert.equal(route.includes('user.delete'), false);
  assert.equal(route.includes('.delete('), false);
  assert.match(signIn, /staffRowIfPasswordAccepted/);
  assert.match(signIn, /deactivatedAt: true/);
  assert.match(readFileSync('lib/auth/loadStaffAuth.ts', 'utf8'), /deactivatedAt: true/);
});
