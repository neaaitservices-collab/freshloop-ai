import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';
import { canVisit, homeForRole, isRoleName, type RoleName } from '@/lib/utils/roles';
import { homePathForRole } from '@/lib/utils/roleRouting';

const { auth } = NextAuth(authConfig);

const PUBLIC_PAGE_PREFIXES = ['/login', '/signup', '/forgot-password', '/reset-password'];

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isAuthApi(pathname: string): boolean {
  return pathname.startsWith('/api/auth');
}

function isPublicApi(pathname: string): boolean {
  return isAuthApi(pathname) || pathname === '/api/health';
}

type MiddlewareSession = {
  user?: { id?: string; email?: string | null; role?: string };
} | null;

function isLoggedIn(session: MiddlewareSession): boolean {
  const user = session?.user;
  if (!user) return false;
  if (user.id) return true;
  return typeof user.email === 'string' && user.email.length > 0;
}

function roleFromAuth(session: { user?: { role?: string } } | null): RoleName | null {
  const roleRaw = session?.user?.role;
  return typeof roleRaw === 'string' && isRoleName(roleRaw) ? roleRaw : null;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const loggedIn = isLoggedIn(session);
  const role = roleFromAuth(session) ?? (loggedIn ? ('FLOOR_STAFF' as RoleName) : null);

  if (pathname.startsWith('/api/')) {
    if (isPublicApi(pathname)) {
      return NextResponse.next();
    }
    if (!loggedIn) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized — sign in required.' },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  if (isPublicPage(pathname)) {
    if (
      loggedIn &&
      role &&
      (pathname === '/login' ||
        pathname === '/signup' ||
        pathname === '/forgot-password' ||
        pathname === '/reset-password')
    ) {
      return NextResponse.redirect(new URL(homePathForRole(role), req.url));
    }
    return NextResponse.next();
  }

  if (pathname === '/') {
    if (!loggedIn || !role) {
      const login = new URL('/login', req.url);
      login.searchParams.set('callbackUrl', homePathForRole(role ?? undefined));
      return NextResponse.redirect(login);
    }
    return NextResponse.redirect(new URL(homeForRole(role), req.url));
  }

  if (!loggedIn || !role) {
    const login = new URL('/login', req.url);
    login.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(login);
  }

  if (!canVisit(role, pathname)) {
    return NextResponse.redirect(new URL(homeForRole(role), req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
