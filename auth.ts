import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { JWT } from 'next-auth/jwt';
import { authConfig } from '@/auth.config';
import { prisma } from '@/lib/domains/inventory/ledger';
import { verifyPassword } from '@/lib/auth/password';
import { loadStaffAuthRow } from '@/lib/auth/loadStaffAuth';
import { getStaffHourlyRate } from '@/lib/auth/staffHourlyRate';
import { sessionClaimsFromLookup } from '@/lib/auth/staffSnapshot';
import { isRoleName } from '@/lib/utils/roles';
import { checkRateLimit, isOverRateLimit } from '@/lib/security/rateLimit';

function revokedToken(token: JWT): JWT {
  return {
    ...token,
    id: undefined,
    sub: undefined,
    role: undefined,
    position: undefined,
    hourlyRate: undefined,
    name: undefined,
    email: undefined,
    revoked: true,
  };
}

/** Credentials + JWT only — do not use PrismaAdapter (breaks credential sessions). */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      const next = authConfig.callbacks.jwt({ token, user });
      // Login just loaded this row in `authorize`. Later requests re-read staff_users.
      if (user) return next;

      const userId =
        (typeof next.id === 'string' && next.id) ||
        (typeof next.sub === 'string' && next.sub) ||
        '';
      if (!userId) return revokedToken(next);

      try {
        const claims = sessionClaimsFromLookup({
          ok: true,
          row: await loadStaffAuthRow(userId),
        });
        if (!claims.user || claims.credentialVersion === null) {
          return { ...revokedToken(next), lookupFailed: claims.lookupFailed };
        }
        const tokenVersion =
          typeof next.credentialVersion === 'number' && Number.isFinite(next.credentialVersion)
            ? next.credentialVersion
            : 0;
        if (tokenVersion !== claims.credentialVersion) return revokedToken(next);
        next.credentialVersion = claims.credentialVersion;
        next.id = claims.user.id;
        next.sub = claims.user.id;
        next.role = claims.user.role;
        next.position = claims.user.position;
        next.hourlyRate = claims.user.hourlyRate;
        next.name = claims.user.name;
        next.email = claims.user.email;
        next.revoked = false;
        next.lookupFailed = false;
        return next;
      } catch {
        // Fail closed: do not keep the previous role when the lookup throws.
        return { ...revokedToken(next), lookupFailed: true };
      }
    },
    session({ session, token }) {
      const role = typeof token.role === 'string' ? token.role : '';
      if (token.lookupFailed) {
        return { expires: session.expires, staffLookupFailed: true };
      }
      if (token.revoked || !token.id || !isRoleName(role)) {
        return { expires: session.expires };
      }
      if (session.user) {
        session.user.id = token.id;
        session.user.role = role;
        session.user.position = typeof token.position === 'string' ? token.position : '';
        session.user.email = typeof token.email === 'string' ? token.email : session.user.email;
        session.user.name = typeof token.name === 'string' ? token.name : session.user.name;
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
  providers: [
    Credentials({
      name: 'Staff credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toString().trim().toLowerCase();
        const password = credentials?.password?.toString() ?? '';
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            position: true,
            passwordHash: true,
            credentialVersion: true,
          },
        });
        if (!user?.passwordHash) return null;

        const loginLimit = { limit: 10, windowMs: 15 * 60_000 };
        const loginKey = `login-fail:${email}`;
        if (isOverRateLimit(loginKey, loginLimit)) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          checkRateLimit(loginKey, loginLimit);
          return null;
        }

        if (!isRoleName(user.role)) return null;

        const hourlyRate = await getStaffHourlyRate(user.id);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          position: user.position,
          hourlyRate,
          credentialVersion: user.credentialVersion,
        };
      },
    }),
  ],
});
