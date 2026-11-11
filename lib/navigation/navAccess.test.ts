import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decideFreshNavigation } from '@/lib/auth/pageAccess';
import { staffUserFromRow, type StaffAuthRow } from '@/lib/auth/staffSnapshot';
import { navItemsForRole } from '@/lib/navigation/navItems';
import { ROLES, canVisit, type RoleName } from '@/lib/utils/roles';

function user(role: StaffAuthRow['role']) {
  return staffUserFromRow({
    id: 'user-1',
    name: 'Alex Rivera',
    email: 'alex@freshloop.local',
    role,
    position: 'Staff',
    hourlyRate: 20,
    passwordHash: 'hash',
    credentialVersion: 0,
  });
}

const MANAGERS: Record<RoleName, boolean> = {
  ADMIN: true,
  STORE_MANAGER: true,
  RECEIVING_CLERK: false,
  FLOOR_STAFF: false,
  DELI_CHEF: false,
};

const ALL_ROLES: Record<RoleName, boolean> = {
  ADMIN: true,
  STORE_MANAGER: true,
  RECEIVING_CLERK: true,
  FLOOR_STAFF: true,
  DELI_CHEF: true,
};

/**
 * Page permissions after this change.
 * /profile is the only route opened to every signed-in role.
 * Other cells stay on the previous canVisit result.
 */
const ROUTE_MATRIX: Record<string, Record<RoleName, boolean>> = {
  '/profile': ALL_ROLES,
  '/admin': MANAGERS,
  '/admin/suppliers': MANAGERS,
  '/admin/users': MANAGERS,
  '/admin/settings': MANAGERS,
  '/admin/departments': MANAGERS,
  '/admin/executive': MANAGERS,
  '/orders': MANAGERS,
  '/operations': MANAGERS,
  '/receive': {
    ADMIN: true,
    STORE_MANAGER: true,
    RECEIVING_CLERK: true,
    FLOOR_STAFF: false,
    DELI_CHEF: false,
  },
  '/inventory': {
    ADMIN: true,
    STORE_MANAGER: true,
    RECEIVING_CLERK: true,
    FLOOR_STAFF: false,
    DELI_CHEF: true,
  },
  '/inventory/floor': ALL_ROLES,
  '/production': {
    ADMIN: true,
    STORE_MANAGER: true,
    RECEIVING_CLERK: false,
    FLOOR_STAFF: false,
    DELI_CHEF: true,
  },
  '/kitchen': {
    ADMIN: true,
    STORE_MANAGER: true,
    RECEIVING_CLERK: false,
    FLOOR_STAFF: false,
    DELI_CHEF: true,
  },
};

test('role-by-route matrix allows /profile for every signed-in role', () => {
  for (const role of ROLES) {
    assert.equal(ROUTE_MATRIX['/profile'][role], true, role);
  }
  for (const [path, expected] of Object.entries(ROUTE_MATRIX)) {
    for (const role of ROLES) {
      assert.equal(canVisit(role, path), expected[role], `${role} ${path}`);
      const session = user(role);
      assert.ok(session);
      const decision = decideFreshNavigation(path, session);
      if (expected[role]) {
        assert.deepEqual(decision, { action: 'allow' }, `${role} ${path}`);
      } else {
        assert.equal(decision.action, 'redirect', `${role} ${path}`);
      }
    }
  }
});

test('profile stays off for signed-out visitors and does not open other profile paths', () => {
  assert.deepEqual(decideFreshNavigation('/profile', null), {
    action: 'redirect',
    location: '/login?callbackUrl=%2Fprofile',
  });
  assert.equal(canVisit('FLOOR_STAFF', '/profile?tab=details'), true);
  assert.equal(canVisit('FLOOR_STAFF', '/profile/extra'), false);
  assert.equal(canVisit('FLOOR_STAFF', '/admin'), false);
  assert.equal(canVisit('RECEIVING_CLERK', '/admin/suppliers'), false);
});

test('every nav link a role is shown passes canVisit for that role', () => {
  for (const role of ROLES) {
    const items = navItemsForRole(role);
    const hrefs = items.flatMap((item) => (item.href ? [item.href] : []));
    assert.ok(hrefs.includes('/profile') || role === 'ADMIN' || role === 'STORE_MANAGER');
    for (const item of items) {
      if (!item.href) continue;
      assert.equal(canVisit(role, item.href), true, `${role} ${item.id} ${item.href}`);
    }
  }

  const floor = navItemsForRole('FLOOR_STAFF');
  assert.deepEqual(
    floor.flatMap((item) => (item.href ? [item.href] : [])),
    ['/inventory/floor', '/profile']
  );
  assert.equal(floor.find((item) => item.id === 'account')?.label, 'Profile');
  assert.equal(floor.some((item) => item.id === 'voice'), true);

  const receiving = navItemsForRole('RECEIVING_CLERK');
  assert.deepEqual(
    receiving.flatMap((item) => (item.href ? [item.href] : [])),
    ['/receive', '/inventory', '/profile']
  );
  assert.equal(receiving.some((item) => item.href === '/admin/suppliers'), false);

  const deli = navItemsForRole('DELI_CHEF');
  assert.deepEqual(
    deli.flatMap((item) => (item.href ? [item.href] : [])),
    ['/inventory', '/production', '/profile']
  );

  for (const role of ['ADMIN', 'STORE_MANAGER'] as const) {
    const hrefs = navItemsForRole(role).flatMap((item) => (item.href ? [item.href] : []));
    assert.equal(hrefs[0], '/admin');
    assert.ok(hrefs.includes('/admin/suppliers'));
    assert.equal(hrefs.includes('/profile'), false);
  }
});

test('floor staff profile navigation is allowed and /admin still sends them home', () => {
  const floor = user('FLOOR_STAFF');
  assert.ok(floor);
  assert.deepEqual(decideFreshNavigation('/profile', floor), { action: 'allow' });
  assert.deepEqual(decideFreshNavigation('/admin', floor), {
    action: 'redirect',
    location: '/inventory/floor',
  });
  assert.deepEqual(decideFreshNavigation('/admin/suppliers', floor), {
    action: 'redirect',
    location: '/inventory/floor',
  });
});

test('profile page guards /profile and renders only the personal profile', () => {
  const page = readFileSync('app/profile/page.tsx', 'utf8');
  const guardAt = page.indexOf("guardFreshPage('/profile')");
  const viewAt = page.indexOf('<PersonalProfile');
  assert.ok(guardAt !== -1 && viewAt !== -1 && guardAt < viewAt);
  assert.equal(page.includes('UserManagementTable'), false);
  assert.equal(page.includes('getAdminStoreStatsBundle'), false);
  assert.equal(page.includes('getStockLevels'), false);

  const form = readFileSync('components/features/profile/PersonalProfile.tsx', 'utf8');
  assert.match(form, /fetch\(`\/api\/users\/\$\{activeUser\.id\}`/);
  assert.equal(form.includes('UserManagementTable'), false);
  assert.equal(form.includes('/api/admin/settings'), false);

  const patch = readFileSync('app/api/users/[id]/route.ts', 'utf8');
  assert.match(patch, /if \(!isSelf && !isManager\(actor\.role\)\)/);
  assert.match(patch, /Only a manager can change a position/);
  assert.match(patch, /Only a manager can change hourly wage/);
});
