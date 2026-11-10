import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/signup/route';
import { prisma } from '@/lib/db/prisma';
import { LEAST_PRIVILEGED_ROLE } from '@/lib/utils/roles';

process.env.DATABASE_URL ??= 'postgresql://user:pass@127.0.0.1:1/freshloop_unused';
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

function signupRequest(ip: string) {
  return new NextRequest('http://127.0.0.1/api/auth/signup', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify({
      name: 'Pat Lee',
      email: 'pat.lee@example.com',
      password: 'not-the-demo-password',
      role: 'Owner',
    }),
  });
}

test('POST with role=Owner does not create an Owner', async (t) => {
  const previousFlag = process.env.ALLOW_PUBLIC_SIGNUP;
  const created: Array<Record<string, unknown>> = [];
  const originalCreate = prisma.user.create;
  const originalFind = prisma.storeSetting.findFirst;

  prisma.user.create = (async (args: { data: Record<string, unknown> }) => {
    created.push(args.data);
    return {
      id: 'user-test',
      name: args.data.name,
      email: args.data.email,
      position: args.data.position,
      role: args.data.role,
      hourlyRate: 17.6,
    };
  }) as unknown as typeof originalCreate;
  prisma.storeSetting.findFirst = (async () => null) as unknown as typeof originalFind;

  t.after(() => {
    prisma.user.create = originalCreate;
    prisma.storeSetting.findFirst = originalFind;
    if (previousFlag === undefined) delete process.env.ALLOW_PUBLIC_SIGNUP;
    else process.env.ALLOW_PUBLIC_SIGNUP = previousFlag;
  });

  process.env.ALLOW_PUBLIC_SIGNUP = 'true';
  const open = await POST(signupRequest('203.0.113.10'));
  const openJson = await open.json();
  assert.equal(open.status, 200);
  assert.equal(openJson.success, true);
  assert.equal(openJson.user.role, LEAST_PRIVILEGED_ROLE);
  assert.equal(openJson.user.role, 'FLOOR_STAFF');
  assert.notEqual(openJson.user.role, 'ADMIN');
  assert.notEqual(openJson.user.role, 'Owner');
  assert.equal(created.length, 1);
  assert.equal(created[0]?.role, 'FLOOR_STAFF');

  created.length = 0;
  process.env.ALLOW_PUBLIC_SIGNUP = 'false';
  const closed = await POST(signupRequest('203.0.113.11'));
  const closedJson = await closed.json();
  assert.equal(closed.status, 403);
  assert.equal(closedJson.success, false);
  assert.match(closedJson.error, /Registration is closed/);
  assert.equal(closedJson.user, undefined);
  assert.equal(created.length, 0);
});
