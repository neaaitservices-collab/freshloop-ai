export const ROLES = [
  'ADMIN',
  'STORE_MANAGER',
  'RECEIVING_CLERK',
  'FLOOR_STAFF',
  'DELI_CHEF',
] as const;

export type RoleName = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  ADMIN: 'Admin',
  STORE_MANAGER: 'Store manager',
  RECEIVING_CLERK: 'Receiving',
  FLOOR_STAFF: 'Floor',
  DELI_CHEF: 'Kitchen',
};

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  position: string;
  role: RoleName;
}

export function isRoleName(value: string): value is RoleName {
  return (ROLES as readonly string[]).includes(value);
}

const MANAGER_ROLES: RoleName[] = ['ADMIN', 'STORE_MANAGER'];

export function isManager(role: RoleName): boolean {
  return MANAGER_ROLES.includes(role);
}

export function homeForRole(role: RoleName): string {
  if (role === 'RECEIVING_CLERK') return '/receive';
  if (role === 'FLOOR_STAFF') return '/inventory';
  if (role === 'DELI_CHEF') return '/kitchen';
  return '/admin';
}

export function canVisit(role: RoleName, pathname: string): boolean {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return true;
  if (isManager(role)) return true;
  if (role === 'RECEIVING_CLERK') {
    return (
      pathname === '/receive' ||
      pathname.startsWith('/receive/') ||
      pathname === '/inventory' ||
      pathname.startsWith('/inventory/')
    );
  }
  if (role === 'FLOOR_STAFF') {
    return pathname === '/inventory' || pathname.startsWith('/inventory/');
  }
  if (role === 'DELI_CHEF') return pathname === '/kitchen' || pathname.startsWith('/kitchen/');
  return false;
}
