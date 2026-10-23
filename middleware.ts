import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ROLE_COOKIE, homePathForRole } from '@/lib/utils/roleRouting';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname !== '/') {
    return NextResponse.next();
  }

  const role = request.cookies.get(ROLE_COOKIE)?.value;
  const destination = homePathForRole(role);
  return NextResponse.redirect(new URL(destination, request.url));
}

export const config = {
  matcher: ['/'],
};
