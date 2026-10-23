import type { RoleName } from '@/lib/utils/roles';
import { isRoleName } from '@/lib/utils/roles';

/** Cookie read by Edge middleware (keep in sync with RoleProvider). */
export const ROLE_COOKIE = 'freshloop-role';
export const USER_ID_COOKIE = 'freshloop-active-user-id';

export function homePathForRole(role: string | undefined | null): string {
  if (!role || !isRoleName(role)) return '/admin';
  switch (role as RoleName) {
    case 'RECEIVING_CLERK':
      return '/receive';
    case 'FLOOR_STAFF':
      return '/inventory/floor';
    case 'DELI_CHEF':
      return '/kitchen';
    default:
      return '/admin';
  }
}
