import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { DELETE, PATCH } from '@/app/api/users/[id]/route';
import { setAdminStaffTestAuth } from '@/lib/auth/adminStaffTestAuth';
import { setManagerStaffTestAuth } from '@/lib/auth/managerStaffTestAuth';
import type { StaffAccountDb, StaffRecord } from '@/lib/auth/staffAccount';
import { setStaffAccountDbForTests } from '@/lib/auth/staffAccountStore';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';
import { ROLES, type RoleName } from '@/lib/utils/roles';

function user(role: RoleName): AuthSessionUser {
  return {
    id: `http-${role}`,
    name: role,
    email: `${role.toLowerCase()}@freshloop.test`,
    role,
    position: 'Staff',
    hourlyRate: null,
  };
}

function context() {
  return { params: Promise.resolve({ id: 'floor-1' }) };
}

function roleRequest(complete: boolean) {
  return new NextRequest('http://localhost/api/users/floor-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      complete
        ? {
            role: 'FLOOR_STAFF',
            name: 'Floor Staff',
            email: 'floor@freshloop.test',
          }
        : { role: 'FLOOR_STAFF' }
    ),
  });
}

function staffRow(overrides: Partial<StaffRecord> = {}): StaffRecord {
  return {
    id: 'owner-1',
    name: 'Owner',
    email: 'owner@freshloop.test',
    position: 'Owner',
    role: 'ADMIN',
    credentialVersion: 1,
    deactivatedAt: null,
    ...overrides,
  };
}

function fakeDb(rows: StaffRecord[]): StaffAccountDb {
  const users = rows.map((row) => ({ ...row }));
  const db: StaffAccountDb = {
    async findById(id) {
      return users.find((row) => row.id === id) ?? null;
    },
    async countActiveOwners() {
      return 1;
    },
    async passwordHashFor() {
      return 'hash';
    },
    async update() {
      throw new Error('staff edit should have been rejected before a write');
    },
    async withActiveOwnerLock(fn) {
      return fn(db);
    },
  };
  return db;
}

test('role edit allows an owner past auth and rejects everyone else with 403', async () => {
  try {
    for (const role of ROLES) {
      setAdminStaffTestAuth(async () => user(role));
      const response = await PATCH(roleRequest(role !== 'ADMIN'), context());
      const body = (await response.json()) as { success?: boolean; error?: string };
      if (role === 'ADMIN') {
        assert.equal(response.status, 400, body.error);
        assert.equal(body.success, false);
        assert.match(body.error ?? '', /name/i);
      } else {
        assert.equal(response.status, 403, `${role} ${body.error ?? ''}`);
        assert.equal(body.success, false);
      }
    }
  } finally {
    setAdminStaffTestAuth(null);
  }
});

test('a store manager editing an owner is forbidden', async () => {
  const owner = staffRow();
  try {
    setManagerStaffTestAuth(async () => ({ ...user('STORE_MANAGER'), id: 'manager-1' }));
    setStaffAccountDbForTests(fakeDb([owner, staffRow({ id: 'manager-2', role: 'STORE_MANAGER', email: 'peer@freshloop.test', name: 'Peer' })]));
    const ownerEdit = await PATCH(
      new NextRequest('http://localhost/api/users/owner-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Owner', email: 'thief@freshloop.test' }),
      }),
      { params: Promise.resolve({ id: 'owner-1' }) }
    );
    const ownerBody = (await ownerEdit.json()) as { success?: boolean; error?: string };
    assert.equal(ownerEdit.status, 403, ownerBody.error);
    assert.match(ownerBody.error ?? '', /at or above your role/);

    const peerEdit = await PATCH(
      new NextRequest('http://localhost/api/users/manager-2', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Peer', email: 'peer@freshloop.test', hourlyRate: 19 }),
      }),
      { params: Promise.resolve({ id: 'manager-2' }) }
    );
    assert.equal(peerEdit.status, 403);
    assert.equal(owner.email, 'owner@freshloop.test');
  } finally {
    setManagerStaffTestAuth(null);
    setStaffAccountDbForTests(null);
  }
});

test('deactivate is owner-only and other roles get 403 before any write', async () => {
  try {
    for (const role of ROLES) {
      if (role === 'ADMIN') continue;
      setAdminStaffTestAuth(async () => user(role));
      const response = await DELETE(
        new NextRequest('http://localhost/api/users/floor-1', { method: 'DELETE' }),
        context()
      );
      const body = (await response.json()) as { success?: boolean };
      assert.equal(response.status, 403, role);
      assert.equal(body.success, false);
    }
  } finally {
    setAdminStaffTestAuth(null);
  }
});
