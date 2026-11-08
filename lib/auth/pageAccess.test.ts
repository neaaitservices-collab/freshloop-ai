import assert from 'node:assert/strict';
import test from 'node:test';
import { decideFreshNavigation, decidePageAccess } from '@/lib/auth/pageAccess';
import { staffUserFromRow, type StaffAuthRow } from '@/lib/auth/staffSnapshot';

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

test('missing path fails closed', () => {
  const admin = user('ADMIN');
  assert.deepEqual(decideFreshNavigation('', admin), { action: 'redirect', location: '/login' });
  assert.deepEqual(decideFreshNavigation(null, admin), { action: 'redirect', location: '/login' });
  assert.deepEqual(decideFreshNavigation('orders', admin), { action: 'redirect', location: '/login' });
});

test('fresh navigation sends each role to a page they can open', () => {
  const admin = user('ADMIN');
  const floor = user('FLOOR_STAFF');
  assert.ok(admin && floor);

  assert.deepEqual(decideFreshNavigation('/', null), {
    action: 'redirect',
    location: '/login?callbackUrl=%2F',
  });
  assert.deepEqual(decideFreshNavigation('/', admin), { action: 'redirect', location: '/admin' });
  assert.deepEqual(decideFreshNavigation('/', floor), {
    action: 'redirect',
    location: '/inventory/floor',
  });
  assert.deepEqual(decideFreshNavigation('/orders', floor), {
    action: 'redirect',
    location: '/inventory/floor',
  });
  assert.deepEqual(decideFreshNavigation('/receive', null), {
    action: 'redirect',
    location: '/login?callbackUrl=%2Freceive',
  });
  assert.deepEqual(decideFreshNavigation('/admin', admin), { action: 'allow' });
  assert.deepEqual(decideFreshNavigation('/orders', admin), { action: 'allow' });
  assert.deepEqual(decideFreshNavigation('/inventory/floor', floor), { action: 'allow' });
  assert.deepEqual(decideFreshNavigation('/login', null), { action: 'allow' });
  assert.deepEqual(decidePageAccess('/orders', floor).action, 'redirect');
});
