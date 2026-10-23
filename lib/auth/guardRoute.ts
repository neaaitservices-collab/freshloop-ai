import type { RoleName } from '@/lib/utils/roles';
import { requireRoles, requireSessionUser } from '@/lib/auth/session';

/** Any authenticated staff member (middleware already enforces login on /api). */
export async function requireAuthenticatedStaff() {
  return requireSessionUser();
}

export async function requireManagerStaff() {
  return requireRoles(['ADMIN', 'STORE_MANAGER']);
}

export async function requireReceivingStaff() {
  return requireRoles(['ADMIN', 'STORE_MANAGER', 'RECEIVING_CLERK']);
}

export async function requireKitchenStaff() {
  return requireRoles(['ADMIN', 'STORE_MANAGER', 'DELI_CHEF']);
}

export async function requireOperationalStaff() {
  return requireRoles([
    'ADMIN',
    'STORE_MANAGER',
    'RECEIVING_CLERK',
    'FLOOR_STAFF',
    'DELI_CHEF',
  ] satisfies RoleName[]);
}
