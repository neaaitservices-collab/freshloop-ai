import type { RoleName } from '@/lib/utils/roles';
import { isAdmin, isManager } from '@/lib/utils/roles';

/** Platform admin — store settings, pull sensitivity, physical stock overrides. */
export function canAdminPlatform(role: RoleName | null | undefined): boolean {
  return role != null && isAdmin(role);
}

/** Department reference list — admin and store manager. Other roles have no access. */
export function canViewDepartments(role: RoleName | null | undefined): boolean {
  return role === 'ADMIN' || role === 'STORE_MANAGER';
}

/** Add, rename, and activate departments. Store managers are read-only. */
export function canEditDepartments(role: RoleName | null | undefined): boolean {
  return role === 'ADMIN';
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

/**
 * Set bundles list + bundle calculator — **owner (ADMIN)** and **STORE_MANAGER** only.
 * Calculator only; no POS write.
 */
export function canManageBundleDeals(role: RoleName | null | undefined): boolean {
  return role != null && isManager(role);
}

export const BUNDLE_DEALS_ROLE_HINT =
  'Only the owner or a store manager can use set bundles and the bundle calculator.';

/** Read saved bundle promos (signage reference) — any signed-in staff. */
export function canViewSetBundlePromos(role: RoleName | null | undefined): boolean {
  return role != null;
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
