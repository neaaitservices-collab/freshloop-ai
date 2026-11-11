import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/** Fields present before optional multi-store migration (excludes store_id). */
export const storeSettingSafeSelect = {
  id: true,
  storeName: true,
  targetWastePct: true,
  scrapBucketVolumeL: true,
  estimatedWeightPerLiterKg: true,
  defaultScrapCostPerKg: true,
  defaultLaborRatePerHour: true,
  pullSensitivityDays: true,
  costGuardrailVariancePct: true,
  // priceChangeThresholdPct is omitted so stats and settings reads work before that column exists.
  defaultParCases: true,
  updatedAt: true,
} satisfies Prisma.StoreSettingSelect;

export type StoreSettingSafe = Prisma.StoreSettingGetPayload<{
  select: typeof storeSettingSafeSelect;
}>;

const SETTING_CACHE_MS = 30_000;
let cachedSetting: { at: number; value: Promise<StoreSettingSafe | null> } | null = null;

export function invalidateStoreSettingCache(): void {
  cachedSetting = null;
}

export function findLatestStoreSetting(): Promise<StoreSettingSafe | null> {
  const now = Date.now();
  if (cachedSetting && now - cachedSetting.at < SETTING_CACHE_MS) {
    return cachedSetting.value;
  }
  const value = prisma.storeSetting
    .findFirst({
      orderBy: { updatedAt: 'desc' },
      select: storeSettingSafeSelect,
    })
    .catch((error: unknown) => {
      cachedSetting = null;
      throw error;
    });
  cachedSetting = { at: now, value };
  return value;
}
