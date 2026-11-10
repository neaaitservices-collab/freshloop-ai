import { homePathForRole } from '@/lib/utils/roleRouting';

export const ROLES = [
  'ADMIN',
  'STORE_MANAGER',
  'RECEIVING_CLERK',
  'FLOOR_STAFF',
  'DELI_CHEF',
] as const;

export type RoleName = (typeof ROLES)[number];

/**
 * Narrowest existing role: floor inventory only.
 * Public signup assigns this and never a client-supplied role.
 */
export const LEAST_PRIVILEGED_ROLE: RoleName = 'FLOOR_STAFF';

export const ROLE_LABELS: Record<RoleName, string> = {
  ADMIN: 'Admin',
  STORE_MANAGER: 'Store manager',
  RECEIVING_CLERK: 'Receiving',
  FLOOR_STAFF: 'Floor',
  DELI_CHEF: 'Production',
};

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  position: string;
  role: RoleName;
  hourlyRate?: number | null;
}

export function isRoleName(value: string): value is RoleName {
  return (ROLES as readonly string[]).includes(value);
}

const MANAGER_ROLES: RoleName[] = ['ADMIN', 'STORE_MANAGER'];

export function isManager(role: RoleName): boolean {
  return MANAGER_ROLES.includes(role);
}

export function isAdmin(role: RoleName): boolean {
  return role === 'ADMIN';
}

export function homeForRole(role: RoleName): string {
  return homePathForRole(role);
}

export function canVisit(role: RoleName, pathname: string): boolean {
  const path = pathname.split('?')[0];

  if (
    path === '/login' ||
    path === '/signup' ||
    path === '/forgot-password' ||
    path === '/reset-password' ||
    path.startsWith('/api/auth')
  ) {
    return true;
  }

  // Every signed-in role may open their own profile. Session checks stay in the page and API.
  if (path === '/profile') return true;

  if (path === '/admin' || path.startsWith('/admin/')) {
    return isManager(role);
  }

  if (isManager(role)) return true;
  if (path === '/orders' || path.startsWith('/orders/')) return false;
  if (path === '/operations' || path.startsWith('/operations/')) return false;

  if (path === '/inventory/floor' || path.startsWith('/inventory/floor/')) {
    return true;
  }

  if (role === 'RECEIVING_CLERK') {
    return (
      path === '/receive' ||
      path.startsWith('/receive/') ||
      path === '/inventory' ||
      path.startsWith('/inventory/')
    );
  }
  if (role === 'FLOOR_STAFF') {
    return path === '/inventory/floor' || path.startsWith('/inventory/floor/');
  }
  if (role === 'DELI_CHEF') {
    return (
      path === '/production' ||
      path.startsWith('/production/') ||
      path === '/kitchen' ||
      path.startsWith('/kitchen/') ||
      path === '/inventory' ||
      path.startsWith('/inventory/')
    );
  }
  return false;
}
