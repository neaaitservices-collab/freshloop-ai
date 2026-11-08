/**
 * Edge login gate. Role is intentionally not an input.
 * A JWT role snapshot must not allow or deny a page here; Node `decidePageAccess` does that
 * after reading `staff_users`.
 */

const PUBLIC_PAGE_PREFIXES = ['/login', '/signup', '/forgot-password', '/reset-password'];

export type EdgeAccessDecision =
  | { type: 'continue' }
  | { type: 'unauthorized-api' }
  | { type: 'login'; callbackUrl: string };

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isPublicApi(pathname: string): boolean {
  return (
    pathname.startsWith('/api/auth') ||
    pathname === '/api/health' ||
    pathname === '/api/pos/webhook' ||
    pathname.startsWith('/api/pos/webhook/')
  );
}

export function decideEdgeAccess(pathname: string, loggedIn: boolean): EdgeAccessDecision {
  if (pathname.startsWith('/api/')) {
    if (isPublicApi(pathname)) return { type: 'continue' };
    if (!loggedIn) return { type: 'unauthorized-api' };
    return { type: 'continue' };
  }

  if (isPublicPage(pathname)) return { type: 'continue' };

  if (!loggedIn) {
    const callback = pathname.startsWith('/') && !pathname.startsWith('//') ? pathname : '/';
    return { type: 'login', callbackUrl: callback };
  }

  return { type: 'continue' };
}
