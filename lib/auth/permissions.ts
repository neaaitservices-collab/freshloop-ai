import type { RoleName } from '@/lib/utils/roles';

export const MANUFACTURING_ROLES: RoleName[] = [
  'DELI_CHEF',
  'ADMIN',
  'STORE_MANAGER',
];

export const MANAGER_ROLES: RoleName[] = ['ADMIN', 'STORE_MANAGER'];

/** Volumetric scrap logging on the production / operations floor. */
export const SCRAP_LOG_ROLES: RoleName[] = [
  'ADMIN',
  'STORE_MANAGER',
  'DELI_CHEF',
  'FLOOR_STAFF',
  'RECEIVING_CLERK',
];
