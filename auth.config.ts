import type { NextAuthConfig } from 'next-auth';
import type { RoleName } from '@/lib/utils/roles';
import { isRoleName } from '@/lib/utils/roles';

/**
 * Edge-safe Auth.js config (no Prisma). Shared by middleware and `auth.ts`.
 */
export const authConfig = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
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
        const rate = (user as { hourlyRate?: number | null }).hourlyRate;
        token.hourlyRate =
          typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
        const version = (user as { credentialVersion?: number | null }).credentialVersion;
        token.credentialVersion =
          typeof version === 'number' && Number.isFinite(version) && version >= 0 ? version : 0;
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
        const rate = token.hourlyRate;
        session.user.hourlyRate =
          typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
        const version = token.credentialVersion;
        session.user.credentialVersion =
          typeof version === 'number' && Number.isFinite(version) && version >= 0 ? version : 0;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
