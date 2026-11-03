import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';
import { resolveLaborRatePerHour } from '@/lib/domains/manufacturing/resolveLaborRate';

let columnEnsured = false;

export async function ensureStaffHourlyRateColumn(): Promise<void> {
  if (columnEnsured) return;
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "hourly_rate_per_hour" DOUBLE PRECISION'
    );
    columnEnsured = true;
  } catch {
    // Ignore if DB user lacks DDL privileges or table is already migrated
  }
}

export async function getStaffHourlyRate(userId: string): Promise<number | null> {
  try {
    await ensureStaffHourlyRateColumn();
    const rows = await prisma.$queryRaw<Array<{ hourly_rate_per_hour: number | null }>>`
      SELECT "hourly_rate_per_hour"
      FROM "staff_users"
      WHERE "id" = ${userId}
      LIMIT 1
    `;
    const rate = rows[0]?.hourly_rate_per_hour;
    if (rate == null || !Number.isFinite(Number(rate)) || Number(rate) <= 0) return null;
    return Number(Number(rate).toFixed(4));
  } catch {
    return null;
  }
}

export async function getStaffHourlyRateMap(
  userIds: string[]
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  if (userIds.length === 0) return map;
  try {
    await ensureStaffHourlyRateColumn();
    const rows = await prisma.$queryRaw<
      Array<{ id: string; hourly_rate_per_hour: number | null }>
    >`
      SELECT "id", "hourly_rate_per_hour"
      FROM "staff_users"
      WHERE "id" IN (${Prisma.join(userIds)})
    `;
    for (const row of rows) {
      const rate = row.hourly_rate_per_hour;
      map.set(
        row.id,
        rate != null && Number.isFinite(Number(rate)) && Number(rate) > 0
          ? Number(Number(rate).toFixed(2))
          : null
      );
    }
  } catch {
    // Fallback to empty map if column unavailable
  }
  return map;
}

export async function setStaffHourlyRate(
  userId: string,
  hourlyRate: number | null
): Promise<number | null> {
  await ensureStaffHourlyRateColumn();
  const normalized =
    hourlyRate != null && Number.isFinite(hourlyRate) && hourlyRate > 0
      ? Number(hourlyRate.toFixed(2))
      : null;
  await prisma.$executeRaw`
    UPDATE "staff_users"
    SET "hourly_rate_per_hour" = ${normalized}, "updated_at" = NOW()
    WHERE "id" = ${userId}
  `;
  return normalized;
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
