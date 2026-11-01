import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';

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
  updatedAt: true,
} satisfies Prisma.StoreSettingSelect;

export type StoreSettingSafe = Prisma.StoreSettingGetPayload<{
  select: typeof storeSettingSafeSelect;
}>;

export function findLatestStoreSetting(): Promise<StoreSettingSafe | null> {
  return prisma.storeSetting.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: storeSettingSafeSelect,
  });
}
