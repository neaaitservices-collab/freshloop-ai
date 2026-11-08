import { cache } from 'react';
import { prisma } from '@/lib/domains/inventory/ledger';
import type { StaffAuthRow } from '@/lib/auth/staffSnapshot';

/**
 * One indexed read of `staff_users` for the signed-in id.
 * `cache` dedupes the JWT callback and `getSessionUser` within a single request.
 * The rejection is cached for that request so a failed lookup cannot be retried as success.
 */
export const loadStaffAuthRow = cache(async (userId: string): Promise<StaffAuthRow | null> => {
  const id = userId.trim();
  if (!id) return null;
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      position: true,
      hourlyRate: true,
      passwordHash: true,
      credentialVersion: true,
    },
  });
});
