import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';
import { canVisit, homeForRole } from '@/lib/utils/roles';
import { homePathForRole } from '@/lib/utils/roleRouting';

/** Set by edge middleware from the real URL. Page authorization reads this in Node. */
export const FRESH_PATH_HEADER = 'x-freshloop-pathname';

const PUBLIC_PAGE_PREFIXES = ['/login', '/signup', '/forgot-password', '/reset-password'];

const AUTH_ENTRY_PAGES = new Set(['/login', '/signup', '/forgot-password', '/reset-password']);

export function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export type PageAccessDecision =
  | { action: 'allow' }
  | { action: 'redirect'; location: string };

function loginLocation(pathname: string): string {
  const callback = pathname.startsWith('/') && !pathname.startsWith('//') ? pathname : '/';
  return `/login?callbackUrl=${encodeURIComponent(callback)}`;
}

/**
 * Page RBAC using the database role (or no user).
 * Edge middleware does not call this — it cannot read Prisma.
 */
export function decidePageAccess(
  pathname: string,
  user: AuthSessionUser | null
): PageAccessDecision {
  const path = pathname.split('?')[0] || '/';

  if (isPublicPage(path)) {
    if (user && AUTH_ENTRY_PAGES.has(path)) {
      return { action: 'redirect', location: homePathForRole(user.role) };
    }
    return { action: 'allow' };
  }

  if (!user) {
    return { action: 'redirect', location: loginLocation(path) };
  }

  if (path === '/') {
    return { action: 'redirect', location: homeForRole(user.role) };
  }

  if (!canVisit(user.role, path)) {
    return { action: 'redirect', location: homeForRole(user.role) };
  }

  return { action: 'allow' };
}
