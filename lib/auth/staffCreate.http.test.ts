import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/users/route';
import { setManagerStaffTestAuth } from '@/lib/auth/managerStaffTestAuth';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';
import { prisma } from '@/lib/db/prisma';
import type { RoleName } from '@/lib/utils/roles';

process.env.DATABASE_URL ??= 'postgresql://user:pass@127.0.0.1:1/freshloop_unused';
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

type CreatedStaff = {
  name?: string;
  email?: string;
  position?: string;
  role?: string;
};

function actor(role: 'ADMIN' | 'STORE_MANAGER'): AuthSessionUser {
  return {
    id: `http-${role}`,
    name: role === 'ADMIN' ? 'Owner' : 'Store manager',
    email: `${role.toLowerCase()}@freshloop.test`,
    role,
    position: role === 'ADMIN' ? 'Owner' : 'Store manager',
    hourlyRate: 22,
  };
}

function createRequest(position: string, email: string) {
  return new NextRequest('http://localhost/api/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'New Hire',
      email,
      position,
      hourlyRate: 18,
    }),
  });
}

test('POST /api/users refuses a non-owner creating a role at or above their own', async (t) => {
  const created: CreatedStaff[] = [];
  const writes = { count: 0 };
  const originalCreate = prisma.user.create;
  const originalUpdate = prisma.user.update;
  const originalFindUnique = prisma.user.findUnique;
  const originalTokenDelete = prisma.verificationToken.deleteMany;
  const originalTokenCreate = prisma.verificationToken.create;

  prisma.user.create = (async (args: { data: CreatedStaff }) => {
    writes.count += 1;
    created.push(args.data);
    return {
      id: 'created-1',
      name: args.data.name,
      email: args.data.email,
      position: args.data.position,
      role: args.data.role,
      hourlyRate: null,
    };
  }) as unknown as typeof originalCreate;
  prisma.user.update = (async () => {
    writes.count += 1;
    return { hourlyRate: 18 };
  }) as unknown as typeof originalUpdate;
  prisma.user.findUnique = (async () => ({
    deactivatedAt: null,
  })) as unknown as typeof originalFindUnique;
  prisma.verificationToken.deleteMany = (async () => {
    writes.count += 1;
    return { count: 0 };
  }) as unknown as typeof originalTokenDelete;
  prisma.verificationToken.create = (async (args: {
    data: { identifier: string; token: string; expires: Date };
  }) => {
    writes.count += 1;
    return args.data;
  }) as unknown as typeof originalTokenCreate;

  t.after(() => {
    prisma.user.create = originalCreate;
    prisma.user.update = originalUpdate;
    prisma.user.findUnique = originalFindUnique;
    prisma.verificationToken.deleteMany = originalTokenDelete;
    prisma.verificationToken.create = originalTokenCreate;
    setManagerStaffTestAuth(null);
  });

  async function post(role: 'ADMIN' | 'STORE_MANAGER', position: string, email: string) {
    created.length = 0;
    writes.count = 0;
    setManagerStaffTestAuth(async () => actor(role));
    const response = await POST(createRequest(position, email));
    const body = (await response.json()) as {
      success?: boolean;
      error?: string;
      setupUrl?: string;
      user?: { role?: RoleName };
    };
    return { response, body };
  }

  await t.test('a store manager creating an owner is 403 with no row', async () => {
    const { response, body } = await post('STORE_MANAGER', 'Owner', 'new-owner@freshloop.test');
    assert.equal(response.status, 403, body.error);
    assert.equal(body.success, false);
    assert.equal(body.setupUrl, undefined);
    assert.equal(body.user, undefined);
    assert.equal(created.length, 0);
    assert.equal(writes.count, 0);
  });

  await t.test('a store manager creating a store manager is 403 with no row', async () => {
    const { response, body } = await post(
      'STORE_MANAGER',
      'Store manager',
      'new-manager@freshloop.test'
    );
    assert.equal(response.status, 403, body.error);
    assert.equal(body.success, false);
    assert.equal(body.setupUrl, undefined);
    assert.equal(created.length, 0);
    assert.equal(writes.count, 0);
  });

  await t.test('a store manager can create a receiving clerk', async () => {
    const { response, body } = await post('STORE_MANAGER', 'Back door', 'new-clerk@freshloop.test');
    assert.equal(response.status, 200, body.error);
    assert.equal(body.success, true);
    assert.equal(body.user?.role, 'RECEIVING_CLERK');
    assert.equal(typeof body.setupUrl, 'string');
    assert.equal(created.length, 1);
    assert.equal(created[0]?.role, 'RECEIVING_CLERK');
    assert.equal(created[0]?.email, 'new-clerk@freshloop.test');
    assert.ok(writes.count > 0);
  });

  await t.test('an owner can create a store manager', async () => {
    const { response, body } = await post('ADMIN', 'Store manager', 'hired-manager@freshloop.test');
    assert.equal(response.status, 200, body.error);
    assert.equal(body.success, true);
    assert.equal(body.user?.role, 'STORE_MANAGER');
    assert.equal(typeof body.setupUrl, 'string');
    assert.equal(created.length, 1);
    assert.equal(created[0]?.role, 'STORE_MANAGER');
    assert.equal(created[0]?.position, 'Store manager');
  });
});
