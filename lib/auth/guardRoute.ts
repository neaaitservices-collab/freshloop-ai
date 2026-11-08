import type { RoleName } from '@/lib/utils/roles';
import { AuthError, requireRoles, requireSessionUser } from '@/lib/auth/session';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';

let receivingStaffTestAuth: (() => Promise<AuthSessionUser>) | null = null;

/** Test hook. Ignored when NODE_ENV is production. */
export function useReceivingStaffTestAuth(auth: (() => Promise<AuthSessionUser>) | null) {
  if (process.env.NODE_ENV === 'production') return;
  receivingStaffTestAuth = auth;
}

/** Any authenticated staff member (middleware already enforces login on /api). */
export async function requireAuthenticatedStaff() {
  return requireSessionUser();
}

const OWNER_OR_STORE_MANAGER: RoleName[] = ['ADMIN', 'STORE_MANAGER'];

export async function requireManagerStaff() {
  return requireRoles(OWNER_OR_STORE_MANAGER);
}

/** Set bundles + bundle calculator — owner (ADMIN) and store managers only. */
export async function requireOwnerOrStoreManagerForBundles() {
  const user = await requireSessionUser();
  if (!OWNER_OR_STORE_MANAGER.includes(user.role)) {
    throw new AuthError(
      'Only the owner or a store manager can use set bundles and the bundle calculator.',
      403
    );
  }
  return user;
}

export async function requireReceivingStaff() {
  if (receivingStaffTestAuth && process.env.NODE_ENV !== 'production') {
    return receivingStaffTestAuth();
  }
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
