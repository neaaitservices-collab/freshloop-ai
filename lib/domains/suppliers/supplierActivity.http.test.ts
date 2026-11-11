import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/admin/suppliers/[id]/activity/route';
import { PATCH } from '@/app/api/admin/suppliers/[id]/activity/[activityId]/route';
import { POST as voidActivity } from '@/app/api/admin/suppliers/[id]/activity/[activityId]/void/route';
import { setAdminStaffTestAuth } from '@/lib/auth/adminStaffTestAuth';
import { setManagerStaffTestAuth } from '@/lib/auth/managerStaffTestAuth';
import { setReceivingStaffTestAuth } from '@/lib/auth/receivingStaffTestAuth';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';
import { ROLES, type RoleName } from '@/lib/utils/roles';

const supplierId = 'sup_route_1';
const activityId = 'act_route_1';

function user(role: RoleName): AuthSessionUser {
  return {
    id: `activity-${role}`,
    name: role,
    email: `${role.toLowerCase()}@example.com`,
    role,
    position: 'Staff',
    hourlyRate: null,
  };
}

function listContext() {
  return { params: Promise.resolve({ id: supplierId }) };
}

function itemContext() {
  return { params: Promise.resolve({ id: supplierId, activityId }) };
}

test('supplier activity routes reject the wrong role before any write', async () => {
  try {
    for (const role of ROLES) {
      setReceivingStaffTestAuth(async () => user(role));
      const listed = await GET(
        new NextRequest(`http://localhost/api/admin/suppliers/${supplierId}/activity?cursor=not-a-cursor`),
        listContext()
      );
      const manager = role === 'ADMIN' || role === 'STORE_MANAGER';
      const added = await POST(
        new NextRequest(`http://localhost/api/admin/suppliers/${supplierId}/activity`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            manager
              ? { type: 'CREDIT' }
              : { type: 'CREDIT', amount: 12, invoiceRef: 'INV-1', reason: 'SHORT' }
          ),
        }),
        listContext()
      );
      const refused = role === 'FLOOR_STAFF' || role === 'DELI_CHEF';
      assert.equal(listed.status, refused ? 403 : 400, `GET ${role}`);
      assert.equal(added.status, manager ? 400 : 403, `POST credit ${role}`);

      setManagerStaffTestAuth(async () => user(role));
      const received = await PATCH(
        new NextRequest(`http://localhost/api/admin/suppliers/${supplierId}/activity/${activityId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }),
        itemContext()
      );
      assert.equal(received.status, manager ? 400 : 403, `PATCH ${role}`);

      setAdminStaffTestAuth(async () => user(role));
      const voided = await voidActivity(
        new NextRequest(`http://localhost/api/admin/suppliers/${supplierId}/activity/${activityId}/void`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }),
        itemContext()
      );
      assert.equal(voided.status, role === 'ADMIN' ? 400 : 403, `void ${role}`);
    }
  } finally {
    setReceivingStaffTestAuth(null);
    setManagerStaffTestAuth(null);
    setAdminStaffTestAuth(null);
  }
});

test('activity route files guard on the server and never delete a row', () => {
  const root = process.cwd();
  const list = fs.readFileSync(path.join(root, 'app/api/admin/suppliers/[id]/activity/route.ts'), 'utf8');
  const receive = fs.readFileSync(
    path.join(root, 'app/api/admin/suppliers/[id]/activity/[activityId]/route.ts'),
    'utf8'
  );
  const voidRoute = fs.readFileSync(
    path.join(root, 'app/api/admin/suppliers/[id]/activity/[activityId]/void/route.ts'),
    'utf8'
  );
  const store = fs.readFileSync(path.join(root, 'lib/domains/suppliers/supplierActivityStore.ts'), 'utf8');
  const panel = fs.readFileSync(
    path.join(root, 'components/features/suppliers/SupplierActivityPanel.tsx'),
    'utf8'
  );
  assert.match(list, /requireReceivingStaff\(\)/);
  assert.ok(list.indexOf('requireReceivingStaff') < list.indexOf('runSupplierActivity'));
  assert.match(receive, /requireManagerStaff\(\)/);
  assert.ok(receive.indexOf('requireManagerStaff') < receive.indexOf('runSupplierActivity'));
  assert.match(voidRoute, /requireAdminStaff\(\)/);
  assert.ok(voidRoute.indexOf('requireAdminStaff') < voidRoute.indexOf('runSupplierActivity'));
  for (const source of [list, receive, voidRoute, store]) {
    assert.equal(source.includes('export async function DELETE'), false, source.slice(0, 40));
    assert.equal(source.includes('.delete('), false);
    assert.equal(source.includes('deleteMany'), false);
  }
  assert.match(panel, /America\/Toronto/);
  assert.match(panel, /Load more/);
  assert.match(panel, /line-through/);
  assert.match(panel, />\s*Add\s*</);
  assert.equal(/\bkitchen\b/i.test(panel), false);
});
