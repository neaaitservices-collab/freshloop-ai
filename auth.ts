import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from '@/auth.config';
import { prisma } from '@/lib/domains/inventory/ledger';
import { verifyPassword } from '@/lib/auth/password';
import { getStaffHourlyRate } from '@/lib/auth/staffHourlyRate';
import { isRoleName } from '@/lib/utils/roles';

/** Credentials + JWT only — do not use PrismaAdapter (breaks credential sessions). */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? token.sub ?? '';
        session.user.position =
          typeof token.position === 'string' ? token.position : '';
        const rate = token.hourlyRate;
        session.user.hourlyRate =
          typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
      }

      const userId = session.user?.id;
      if (!userId) {
        throw new Error('Session invalid — missing user id.');
      }

      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!row) {
        throw new Error('Session invalid — user not found.');
      }
      if (!isRoleName(row.role)) {
        throw new Error('Session invalid — unknown role.');
      }
      session.user!.role = row.role;

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
          },
        });
        if (!user?.passwordHash) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        if (!isRoleName(user.role)) return null;

        const hourlyRate = await getStaffHourlyRate(user.id);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          position: user.position,
          hourlyRate,
        };
      },
    }),
  ],
});
