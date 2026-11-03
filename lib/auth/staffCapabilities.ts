import type { RoleName } from '@/lib/utils/roles';
import { isAdmin, isManager } from '@/lib/utils/roles';

/** Platform admin — store settings, pull sensitivity, physical stock overrides. */
export function canAdminPlatform(role: RoleName | null | undefined): boolean {
  return role != null && isAdmin(role);
}

/** Manager or admin — staff roster, wages, invoice approval. */
export function canManageStaff(role: RoleName | null | undefined): boolean {
  return role != null && isManager(role);
}

/** Admin-only ledger stock / MAC override (not store managers). */
export function canOverrideInventoryStock(role: RoleName | null | undefined): boolean {
  return canAdminPlatform(role);
}

/** Edit BOM definitions (create recipe, change ingredients/yield). */
export function canEditProductionBom(role: RoleName | null | undefined): boolean {
  return role != null && isManager(role);
}

/** Run manufacturing batch / execute BOM against kitchen prep. */
export function canExecuteProductionBatch(role: RoleName | null | undefined): boolean {
  if (!role) return false;
  return (
    role === 'ADMIN' ||
    role === 'STORE_MANAGER' ||
    role === 'DELI_CHEF'
  );
}

/** Remove staff accounts (destructive). */
export function canRemoveStaff(role: RoleName | null | undefined): boolean {
  return canAdminPlatform(role);
}
