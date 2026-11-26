import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { DELETE, PATCH } from '@/app/api/users/[id]/route';
import { setAdminStaffTestAuth } from '@/lib/auth/adminStaffTestAuth';
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

function roleRequest() {
  return new NextRequest('http://localhost/api/users/floor-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      role: 'OWNER',
      name: 'Floor Staff',
      email: 'floor@freshloop.test',
    }),
  });
}

test('role edit allows an owner past auth and rejects everyone else with 403', async () => {
  try {
    for (const role of ROLES) {
      setAdminStaffTestAuth(async () => user(role));
      const response = await PATCH(roleRequest(), context());
      const body = (await response.json()) as { success?: boolean; error?: string };
      if (role === 'ADMIN') {
        assert.equal(response.status, 400, body.error);
        assert.equal(body.success, false);
      } else {
        assert.equal(response.status, 403, `${role} ${body.error ?? ''}`);
        assert.equal(body.success, false);
      }
    }
  } finally {
    setAdminStaffTestAuth(null);
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
