import assert from 'node:assert/strict';
import test from 'node:test';
import { decideEdgeAccess } from '@/lib/auth/edgeAccess';
import { decidePageAccess } from '@/lib/auth/pageAccess';
import { AuthError, getSessionUser, requireRoles, requireSessionUser } from '@/lib/auth/session';
import {
  sessionClaimsFromLookup,
  staffUserFromRow,
  type StaffAuthRow,
} from '@/lib/auth/staffSnapshot';
import type { RoleName } from '@/lib/utils/roles';

function row(overrides: Partial<StaffAuthRow> = {}): StaffAuthRow {
  return {
    id: 'user-1',
    name: 'Alex Rivera',
    email: 'alex@freshloop.test',
    role: 'ADMIN',
    position: 'Owner',
    hourlyRate: 32,
    passwordHash: 'hashed-password',
    credentialVersion: 0,
    ...overrides,
  };
}

function sessionWithId(id = 'user-1', staleRole: RoleName = 'ADMIN') {
  return {
    user: { id, role: staleRole, email: 'stale@freshloop.test', name: 'Stale Token' },
  };
}

test('legitimate staff keep the database role', async () => {
  const user = await getSessionUser({
    readSession: async () => sessionWithId('user-1', 'ADMIN'),
    loadStaff: async () => row({ role: 'STORE_MANAGER', name: 'Alex Rivera' }),
  });
  assert.ok(user);
  assert.equal(user.role, 'STORE_MANAGER');
  assert.equal(user.name, 'Alex Rivera');
  assert.equal(user.email, 'alex@freshloop.test');
  const same = await requireRoles(['ADMIN', 'STORE_MANAGER'], {
    readSession: async () => sessionWithId('user-1', 'FLOOR_STAFF'),
    loadStaff: async () => row({ role: 'STORE_MANAGER' }),
  });
  assert.equal(same.role, 'STORE_MANAGER');
});

test('demotion drops the stale admin role', async () => {
  const deps = {
    readSession: async () => sessionWithId('user-1', 'ADMIN'),
    loadStaff: async () => row({ role: 'FLOOR_STAFF', position: 'Produce floor' }),
  };
  const user = await getSessionUser(deps);
  assert.equal(user?.role, 'FLOOR_STAFF');
  await assert.rejects(
    () => requireRoles(['ADMIN', 'STORE_MANAGER'], deps),
    (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.status, 403);
      return true;
    }
  );
});

test('promotion grants the current database role', async () => {
  const deps = {
    readSession: async () => sessionWithId('user-1', 'FLOOR_STAFF'),
    loadStaff: async () => row({ role: 'ADMIN' }),
  };
  const user = await requireRoles(['ADMIN'], deps);
  assert.equal(user.role, 'ADMIN');
  assert.notEqual(user.email, 'stale@freshloop.test');
});

test('password change rejects a version 0 token', async () => {
  const deps = {
    readSession: async () => ({
      user: { id: 'user-1', credentialVersion: 0 },
    }),
    loadStaff: async () => row({ credentialVersion: 1 }),
  };
  assert.equal(await getSessionUser(deps), null);
  await assert.rejects(() => requireSessionUser(deps), (error: unknown) => {
    assert.ok(error instanceof AuthError);
    assert.equal(error.status, 401);
    return true;
  });
});

test('legacy tokens match credential version 0', async () => {
  const user = await getSessionUser({
    readSession: async () => ({ user: { id: 'user-1' } }),
    loadStaff: async () => row({ credentialVersion: 0, role: 'FLOOR_STAFF' }),
  });
  assert.equal(user?.role, 'FLOOR_STAFF');
});

test('deleted staff are unauthorized', async () => {
  const deps = {
    readSession: async () => sessionWithId('missing', 'ADMIN'),
    loadStaff: async () => null,
  };
  assert.equal(await getSessionUser(deps), null);
  await assert.rejects(
    () => requireSessionUser(deps),
    (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.status, 401);
      return true;
    }
  );
});

test('cleared password and unknown role revoke access', async () => {
  assert.equal(staffUserFromRow(row({ passwordHash: null })), null);
  assert.equal(staffUserFromRow(row({ role: 'OWNER' })), null);
  const deps = {
    readSession: async () => sessionWithId('user-1', 'ADMIN'),
    loadStaff: async () => row({ passwordHash: null }),
  };
  assert.equal(await getSessionUser(deps), null);
  await assert.rejects(() => requireRoles(['ADMIN'], deps), (error: unknown) => {
    assert.ok(error instanceof AuthError);
    assert.equal(error.status, 401);
    return true;
  });
});

test('staff lookup failures fail closed and ignore the token role', async () => {
  let loaded = false;
  await assert.rejects(
    () =>
      getSessionUser({
        readSession: async () => ({
          ...sessionWithId('user-1', 'ADMIN'),
          staffLookupFailed: true,
        }),
        loadStaff: async () => {
          loaded = true;
          return row({ role: 'ADMIN' });
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.status, 401);
      assert.match(error.message, /could not be verified/);
      return true;
    }
  );
  assert.equal(loaded, false);

  await assert.rejects(
    () =>
      getSessionUser({
        readSession: async () => sessionWithId('user-1', 'ADMIN'),
        loadStaff: async () => {
          throw new Error('database unavailable');
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.status, 401);
      assert.equal((error as Error).message.includes('database unavailable'), false);
      return true;
    }
  );

  const claims = sessionClaimsFromLookup({ ok: false });
  assert.equal(claims.lookupFailed, true);
  assert.equal(claims.user, null);
});

test('anonymous sessions are not staff', async () => {
  assert.equal(
    await getSessionUser({
      readSession: async () => null,
      loadStaff: async () => row(),
    }),
    null
  );
});

test('page access follows the fresh role', () => {
  const admin = staffUserFromRow(row({ role: 'ADMIN' }));
  const floor = staffUserFromRow(row({ role: 'FLOOR_STAFF' }));
  assert.ok(admin && floor);

  assert.deepEqual(decidePageAccess('/admin', admin), { action: 'allow' });
  assert.deepEqual(decidePageAccess('/inventory/floor', floor), { action: 'allow' });
  assert.deepEqual(decidePageAccess('/admin', floor), {
    action: 'redirect',
    location: '/inventory/floor',
  });
  assert.deepEqual(decidePageAccess('/orders', floor), {
    action: 'redirect',
    location: '/inventory/floor',
  });
  assert.equal(decidePageAccess('/admin', admin).action, 'allow');
  assert.deepEqual(decidePageAccess('/', admin), { action: 'redirect', location: '/admin' });
  assert.deepEqual(decidePageAccess('/admin', null), {
    action: 'redirect',
    location: '/login?callbackUrl=%2Fadmin',
  });
  assert.deepEqual(decidePageAccess('/login', null), { action: 'allow' });
  assert.deepEqual(decidePageAccess('/login', admin), { action: 'redirect', location: '/admin' });
  assert.deepEqual(decidePageAccess('/login', floor), {
    action: 'redirect',
    location: '/inventory/floor',
  });
});

test('edge middleware does not authorize from a JWT role', () => {
  assert.deepEqual(decideEdgeAccess('/admin', true), { type: 'continue' });
  assert.deepEqual(decideEdgeAccess('/orders', true), { type: 'continue' });
  assert.deepEqual(decideEdgeAccess('/admin', false), {
    type: 'login',
    callbackUrl: '/admin',
  });
  assert.deepEqual(decideEdgeAccess('/api/inventory/move', false), { type: 'unauthorized-api' });
  assert.deepEqual(decideEdgeAccess('/api/inventory/move', true), { type: 'continue' });
  assert.deepEqual(decideEdgeAccess('/api/health', false), { type: 'continue' });
  assert.deepEqual(decideEdgeAccess('/api/pos/webhook', false), { type: 'continue' });
  assert.deepEqual(decideEdgeAccess('/login', true), { type: 'continue' });
});
