import type { RoleName } from '@/lib/utils/roles';
import { AuthError, requireRoles, requireSessionUser } from '@/lib/auth/session';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';

type ReceivingStaffTestAuth = () => Promise<AuthSessionUser>;

function receivingStaffTestAuth(): ReceivingStaffTestAuth | null {
  if (process.env.NODE_ENV === 'production') return null;
  const hook = (globalThis as { __freshloopReceivingStaffTestAuth?: ReceivingStaffTestAuth })
    .__freshloopReceivingStaffTestAuth;
  return typeof hook === 'function' ? hook : null;
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
  const testAuth = receivingStaffTestAuth();
  if (testAuth) return testAuth();
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
