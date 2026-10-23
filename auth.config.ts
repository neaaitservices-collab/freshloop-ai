import type { NextAuthConfig } from 'next-auth';
import type { RoleName } from '@/lib/utils/roles';
import { isRoleName } from '@/lib/utils/roles';

/**
 * Edge-safe Auth.js config (no Prisma). Shared by middleware and `auth.ts`.
 */
export const authConfig = {
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 12,
  },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.id = user.id;
        if (isRoleName(user.role)) {
          token.role = user.role as RoleName;
        }
        token.position = user.position;
      }
      if (!token.id && token.sub) {
        token.id = token.sub;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? token.sub ?? '';
        const roleStr = typeof token.role === 'string' ? token.role : '';
        if (isRoleName(roleStr)) {
          session.user.role = roleStr;
        } else {
          session.user.role = 'FLOOR_STAFF';
        }
        session.user.position =
          typeof token.position === 'string' ? token.position : '';
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
