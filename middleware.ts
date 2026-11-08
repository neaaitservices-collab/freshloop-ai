import NextAuth from 'next-auth';
import { NextResponse, type NextRequest } from 'next/server';
import { authConfig } from '@/auth.config';
import { decideEdgeAccess } from '@/lib/auth/edgeAccess';
import { FRESH_PATH_HEADER } from '@/lib/auth/pageAccess';

const { auth } = NextAuth(authConfig);

type MiddlewareSession = {
  user?: { id?: string; email?: string | null };
} | null;

function isLoggedIn(session: MiddlewareSession): boolean {
  const user = session?.user;
  if (!user) return false;
  if (user.id) return true;
  return typeof user.email === 'string' && user.email.length > 0;
}

function continueWithPath(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(FRESH_PATH_HEADER, req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const decision = decideEdgeAccess(pathname, isLoggedIn(req.auth));

  if (decision.type === 'unauthorized-api') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized — sign in required.' },
      { status: 401 }
    );
  }

  if (decision.type === 'login') {
    const login = new URL('/login', req.url);
    login.searchParams.set('callbackUrl', decision.callbackUrl);
    return NextResponse.redirect(login);
  }

  return continueWithPath(req);
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
