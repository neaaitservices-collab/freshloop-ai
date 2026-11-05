import { prisma } from '@/lib/domains/inventory/ledger';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';
import { resolveLaborRatePerHour } from '@/lib/domains/manufacturing/resolveLaborRate';

function normalizeHourlyRate(hourlyRate: number | null): number | null {
  return hourlyRate != null && Number.isFinite(hourlyRate) && hourlyRate > 0
    ? Number(hourlyRate.toFixed(2))
    : null;
}

export async function getStaffHourlyRate(userId: string): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { hourlyRate: true },
  });
  return normalizeHourlyRate(user?.hourlyRate ?? null);
}

export async function getStaffHourlyRateMap(
  userIds: string[]
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  if (userIds.length === 0) return map;
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, hourlyRate: true },
  });
  for (const user of users) {
    map.set(user.id, normalizeHourlyRate(user.hourlyRate));
  }
  return map;
}

export async function setStaffHourlyRate(
  userId: string,
  hourlyRate: number | null
): Promise<number | null> {
  const normalized = normalizeHourlyRate(hourlyRate);
  const user = await prisma.user.update({
    where: { id: userId },
    data: { hourlyRate: normalized },
    select: { hourlyRate: true },
  });
  return normalizeHourlyRate(user.hourlyRate);
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
