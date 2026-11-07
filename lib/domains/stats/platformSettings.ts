import { prisma } from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { invalidateStoreStats } from '@/lib/domains/stats/storeStats';
import {
  findLatestStoreSetting,
  storeSettingSafeSelect,
} from '@/lib/domains/stats/storeSettingSelect';

export interface PlatformSettings {
  storeName: string;
  targetWastePct: number;
  scrapBucketVolumeL: number;
  estimatedWeightPerLiterKg: number;
  defaultScrapCostPerKg: number;
  defaultLaborRatePerHour: number;
  pullSensitivityDays: number;
  costGuardrailVariancePct: number;
  /** Default minimum stock in cases (Orders par / low-stock alerts). */
  defaultParCases: number;
}

export const PLATFORM_DEFAULTS: PlatformSettings = {
  storeName: 'FreshLoop Independent Market',
  targetWastePct: 2.5,
  scrapBucketVolumeL: 20,
  estimatedWeightPerLiterKg: 0.65,
  defaultScrapCostPerKg: 3.5,
  defaultLaborRatePerHour: 17.6,
  pullSensitivityDays: 3,
  costGuardrailVariancePct: 20,
  defaultParCases: 2,
};

const PULL_DAYS = new Set([2, 3, 4]);

function finite(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePlatformSettings(body: unknown): { settings: PlatformSettings } | { error: string } {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const storeName = typeof source.storeName === 'string' ? source.storeName.trim() : '';
  const targetWastePct = finite(source.targetWastePct);
  const scrapBucketVolumeL = finite(source.scrapBucketVolumeL);
  const estimatedWeightPerLiterKg = finite(source.estimatedWeightPerLiterKg);
  const defaultScrapCostPerKg = finite(source.defaultScrapCostPerKg);
  const defaultLaborRatePerHour = finite(source.defaultLaborRatePerHour);
  const pullSensitivityDays = finite(source.pullSensitivityDays);
  const costGuardrailVariancePct = finite(source.costGuardrailVariancePct);
  const defaultParCases = finite(source.defaultParCases);

  if (!storeName) return { error: 'Store name is required.' };
  if (targetWastePct === null || targetWastePct < 0 || targetWastePct > 100) {
    return { error: 'Waste target must be between 0 and 100.' };
  }
  if (scrapBucketVolumeL === null || scrapBucketVolumeL <= 0) {
    return { error: 'Scrap bucket size must be greater than 0.' };
  }
  if (estimatedWeightPerLiterKg === null || estimatedWeightPerLiterKg <= 0) {
    return { error: 'Trim density must be greater than 0.' };
  }
  if (defaultScrapCostPerKg === null || defaultScrapCostPerKg < 0) {
    return { error: 'Scrap cost cannot be negative.' };
  }
  if (defaultLaborRatePerHour === null || defaultLaborRatePerHour <= 0) {
    return { error: 'Labor rate must be greater than 0.' };
  }
  if (pullSensitivityDays === null || !PULL_DAYS.has(pullSensitivityDays)) {
    return { error: 'Pull window must be 2, 3, or 4 days.' };
  }
  if (costGuardrailVariancePct === null || costGuardrailVariancePct < 0 || costGuardrailVariancePct > 100) {
    return { error: 'Invoice alert must be between 0 and 100.' };
  }
  if (defaultParCases === null || defaultParCases < 0 || defaultParCases > 999) {
    return { error: 'Minimum stock must be between 0 and 999 cases.' };
  }

  return {
    settings: {
      storeName,
      targetWastePct,
      scrapBucketVolumeL,
      estimatedWeightPerLiterKg,
      defaultScrapCostPerKg,
      defaultLaborRatePerHour,
      pullSensitivityDays,
      costGuardrailVariancePct,
      defaultParCases: Math.round(defaultParCases),
    },
  };
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const row = await findLatestStoreSetting();
  if (!row) return { ...PLATFORM_DEFAULTS };
  return {
    storeName: row.storeName,
    targetWastePct: row.targetWastePct,
    scrapBucketVolumeL: row.scrapBucketVolumeL,
    estimatedWeightPerLiterKg: row.estimatedWeightPerLiterKg,
    defaultScrapCostPerKg: row.defaultScrapCostPerKg,
    defaultLaborRatePerHour: row.defaultLaborRatePerHour ?? 17.6,
    pullSensitivityDays: row.pullSensitivityDays,
    costGuardrailVariancePct: row.costGuardrailVariancePct,
    defaultParCases: row.defaultParCases ?? PLATFORM_DEFAULTS.defaultParCases,
  };
}

export async function savePlatformSettings(settings: PlatformSettings): Promise<PlatformSettings> {
  const existing = await findLatestStoreSetting();
  const previousDefaultParCases =
    existing?.defaultParCases ?? PLATFORM_DEFAULTS.defaultParCases;
  const nextDefaultParCases = Math.round(settings.defaultParCases);
  const data = {
    storeName: settings.storeName,
    targetWastePct: settings.targetWastePct,
    scrapBucketVolumeL: settings.scrapBucketVolumeL,
    estimatedWeightPerLiterKg: settings.estimatedWeightPerLiterKg,
    defaultScrapCostPerKg: settings.defaultScrapCostPerKg,
    defaultLaborRatePerHour: settings.defaultLaborRatePerHour,
    pullSensitivityDays: settings.pullSensitivityDays,
    costGuardrailVariancePct: settings.costGuardrailVariancePct,
    defaultParCases: nextDefaultParCases,
  };
  const saved = existing
    ? await prisma.storeSetting.update({
        where: { id: existing.id },
        data,
        select: storeSettingSafeSelect,
      })
    : await prisma.storeSetting.create({ data, select: storeSettingSafeSelect });

  if (nextDefaultParCases !== previousDefaultParCases) {
    await prisma.product.updateMany({
      where: {
        isManufactured: false,
        parCases: previousDefaultParCases,
      },
      data: { parCases: nextDefaultParCases },
    });
  }

  invalidateInventoryCaches();
  invalidateStoreStats();
  return {
    storeName: saved.storeName,
    targetWastePct: saved.targetWastePct,
    scrapBucketVolumeL: saved.scrapBucketVolumeL,
    estimatedWeightPerLiterKg: saved.estimatedWeightPerLiterKg,
    defaultScrapCostPerKg: saved.defaultScrapCostPerKg,
    defaultLaborRatePerHour: saved.defaultLaborRatePerHour,
    pullSensitivityDays: saved.pullSensitivityDays,
    costGuardrailVariancePct: saved.costGuardrailVariancePct,
    defaultParCases: saved.defaultParCases,
  };
}
