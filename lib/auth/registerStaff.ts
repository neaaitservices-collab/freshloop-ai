import { Role } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { hashPassword } from '@/lib/auth/password';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';

const MIN_PASSWORD_LENGTH = 8;

export function isPublicSignupEnabled(): boolean {
  return process.env.ALLOW_PUBLIC_SIGNUP !== 'false';
}

export async function registerStaffUser(input: {
  name: string;
  email: string;
  password: string;
  position: string;
  role?: Role;
}) {
  if (!isPublicSignupEnabled()) {
    throw new Error('Registration is closed. Ask a store manager for an account.');
  }

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const position = input.position.trim();
  const password = input.password;

  if (!name || !email || !position) {
    throw new Error('Name, email, and position are required.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const passwordHash = await hashPassword(password);
  const role = input.role ?? Role.FLOOR_STAFF;
  const storeSetting = await findLatestStoreSetting();
  const hourlyRate = storeSetting?.defaultLaborRatePerHour ?? 17.6;

  return prisma.user.create({
    data: {
      name,
      email,
      position,
      role,
      passwordHash,
      hourlyRate,
    },
    select: {
      id: true,
      name: true,
      email: true,
      position: true,
      role: true,
      hourlyRate: true,
    },
  });
}
