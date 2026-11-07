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
    async jwt({ token, user, trigger }) {
      authConfig.callbacks.jwt({ token, user });
      if (trigger === 'update' && token.id) {
        const row = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true },
        });
        if (row && isRoleName(row.role)) {
          token.role = row.role;
        }
      }
      return token;
    },
    session(...args) {
      const next = authConfig.callbacks.session(...args);
      const userId = next.user?.id;
      if (!userId) {
        throw new Error('Session invalid — missing user id.');
      }
      if (!isRoleName(next.user!.role)) {
        throw new Error('Session invalid — unknown role.');
      }
      return next;
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
