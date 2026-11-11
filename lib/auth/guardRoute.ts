import type { RoleName } from '@/lib/utils/roles';
import { canEditDepartments, canViewDepartments } from '@/lib/auth/staffCapabilities';
import { AuthError, requireRoles, requireSessionUser } from '@/lib/auth/session';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';

type ReceivingStaffTestAuth = () => Promise<AuthSessionUser>;

function receivingStaffTestAuth(): ReceivingStaffTestAuth | null {
  if (process.env.NODE_ENV === 'production') return null;
  const hook = (globalThis as { __freshloopReceivingStaffTestAuth?: ReceivingStaffTestAuth })
    .__freshloopReceivingStaffTestAuth;
  return typeof hook === 'function' ? hook : null;
}

function operationalStaffTestAuth(): ReceivingStaffTestAuth | null {
  if (process.env.NODE_ENV === 'production') return null;
  const hook = (globalThis as { __freshloopOperationalStaffTestAuth?: ReceivingStaffTestAuth })
    .__freshloopOperationalStaffTestAuth;
  return typeof hook === 'function' ? hook : null;
}

/** Any authenticated staff member (middleware already enforces login on /api). */
export async function requireAuthenticatedStaff() {
  return requireSessionUser();
}

const OWNER_OR_STORE_MANAGER: RoleName[] = ['ADMIN', 'STORE_MANAGER'];
const RECEIVING_ROLES: RoleName[] = ['ADMIN', 'STORE_MANAGER', 'RECEIVING_CLERK'];
const ADMIN_ONLY: RoleName[] = ['ADMIN'];

function managerStaffTestAuth(): ReceivingStaffTestAuth | null {
  if (process.env.NODE_ENV === 'production') return null;
  const hook = (globalThis as { __freshloopManagerStaffTestAuth?: ReceivingStaffTestAuth })
    .__freshloopManagerStaffTestAuth;
  return typeof hook === 'function' ? hook : null;
}

function adminStaffTestAuth(): ReceivingStaffTestAuth | null {
  if (process.env.NODE_ENV === 'production') return null;
  const hook = (globalThis as { __freshloopAdminStaffTestAuth?: ReceivingStaffTestAuth })
    .__freshloopAdminStaffTestAuth;
  return typeof hook === 'function' ? hook : null;
}

async function userFromTestHook(
  hook: ReceivingStaffTestAuth | null,
  allowed: RoleName[]
): Promise<AuthSessionUser | null> {
  if (!hook) return null;
  const user = await hook();
  if (!allowed.includes(user.role)) {
    throw new AuthError('Forbidden — your role cannot perform this action.', 403);
  }
  return user;
}

export async function requireManagerStaff() {
  const hooked = await userFromTestHook(managerStaffTestAuth(), OWNER_OR_STORE_MANAGER);
  if (hooked) return hooked;
  return requireRoles(OWNER_OR_STORE_MANAGER);
}

/** Void and other owner-only mutations. */
export async function requireAdminStaff() {
  const hooked = await userFromTestHook(adminStaffTestAuth(), ADMIN_ONLY);
  if (hooked) return hooked;
  return requireRoles(ADMIN_ONLY);
}

/** Read the department reference list. Admin and store manager only. */
export async function requireDepartmentViewer() {
  const user = await requireSessionUser();
  if (!canViewDepartments(user.role)) {
    throw new AuthError('Forbidden — your role cannot view departments.', 403);
  }
  return user;
}

/** Change the department reference list. Admin only. */
export async function requireDepartmentEditor() {
  const user = await requireSessionUser();
  if (!canEditDepartments(user.role)) {
    throw new AuthError('Only an admin can change departments.', 403);
  }
  return user;
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
  const hooked = await userFromTestHook(receivingStaffTestAuth(), RECEIVING_ROLES);
  if (hooked) return hooked;
  return requireRoles(RECEIVING_ROLES);
}

export async function requireKitchenStaff() {
  return requireRoles(['ADMIN', 'STORE_MANAGER', 'DELI_CHEF']);
}

export async function requireOperationalStaff() {
  const testAuth = operationalStaffTestAuth();
  if (testAuth) return testAuth();
  return requireRoles([
    'ADMIN',
    'STORE_MANAGER',
    'RECEIVING_CLERK',
    'FLOOR_STAFF',
    'DELI_CHEF',
  ] satisfies RoleName[]);
}
