import { prisma } from '@/lib/domains/inventory/ledger';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';
import { resolveLaborRatePerHour } from '@/lib/domains/manufacturing/resolveLaborRate';

export async function getStaffHourlyRate(userId: string): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { hourlyRate: true },
  });
  const rate = user?.hourlyRate;
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  return Number(rate.toFixed(4));
}

/** Resolved labor rate for a manufacturing batch executed by `userId`. */
export async function resolveExecutionLaborRate(
  userId: string,
  recipeLaborRate?: number | null
): Promise<number> {
  const [staffHourlyRate, storeSetting] = await Promise.all([
    getStaffHourlyRate(userId),
    findLatestStoreSetting(),
  ]);
  return resolveLaborRatePerHour({
    staffHourlyRate,
    recipeLaborRate,
    storeDefaultLaborRate: storeSetting?.defaultLaborRatePerHour ?? null,
  });
}
