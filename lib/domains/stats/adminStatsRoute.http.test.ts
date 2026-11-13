import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/stats/route';
import { setManagerStaffTestAuth } from '@/lib/auth/managerStaffTestAuth';
import { AuthError } from '@/lib/auth/session';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';

function statsRequest(query = '') {
  return new NextRequest(`http://localhost/api/admin/stats${query}`);
}

function user(role: AuthSessionUser['role']): AuthSessionUser {
  return {
    id: `stats-${role}`,
    name: 'Stats tester',
    email: 'stats@store.test',
    role,
    position: 'Staff',
    hourlyRate: null,
  };
}

test('GET /api/admin/stats rejects anonymous and floor staff, and a bad scope or range', async (t) => {
  t.after(() => setManagerStaffTestAuth(null));

  setManagerStaffTestAuth(async () => {
    throw new AuthError('Unauthorized — sign in required.', 401);
  });
  const anonymous = await GET(statsRequest());
  assert.equal(anonymous.status, 401);
  const anonymousBody = (await anonymous.json()) as { success?: boolean };
  assert.equal(anonymousBody.success, false);

  setManagerStaffTestAuth(async () => user('FLOOR_STAFF'));
  const forbidden = await GET(statsRequest('?preset=week&scope=period'));
  assert.equal(forbidden.status, 403);
  const forbiddenBody = (await forbidden.json()) as { success?: boolean };
  assert.equal(forbiddenBody.success, false);

  setManagerStaffTestAuth(async () => user('STORE_MANAGER'));
  const scope = await GET(statsRequest('?preset=week&scope=bundle'));
  assert.equal(scope.status, 400);
  const scopeBody = (await scope.json()) as { error?: string };
  assert.match(scopeBody.error ?? '', /Unknown stats scope/);

  const halfRange = await GET(statsRequest('?from=2026-02-01'));
  assert.equal(halfRange.status, 400);
  const halfBody = (await halfRange.json()) as { error?: string };
  assert.match(halfBody.error ?? '', /from and to are both required/);

  const mixed = await GET(statsRequest('?preset=day&from=2026-02-01&to=2026-02-01'));
  assert.equal(mixed.status, 400);

  const periodWithoutRange = await GET(statsRequest('?scope=period'));
  assert.equal(periodWithoutRange.status, 400);
  const periodBody = (await periodWithoutRange.json()) as { error?: string };
  assert.match(periodBody.error ?? '', /Choose a date range/);
});
