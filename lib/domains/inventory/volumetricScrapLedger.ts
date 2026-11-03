import {
  scrapBucketInputsFromSettings,
  scrapTotalsForBucketCount,
} from '@/lib/domains/stats/scrapBucketEconomics';
import type { PlatformSettings } from '@/lib/domains/stats/platformSettings';
import { VOLUMETRIC_SCRAP_REF_PREFIX } from '@/lib/domains/inventory/ledger';

/** Logical ledger type for volumetric bucket scrap (stored as Waste + this marker). */
export const SCRAP_VOLUMETRIC_BUCKET_KIND = 'SCRAP_VOLUMETRIC_BUCKET';

export { VOLUMETRIC_SCRAP_REF_PREFIX as SCRAP_VOLUMETRIC_BUCKET_REF_PREFIX };

export interface VolumetricScrapNotePayload {
  kind: typeof SCRAP_VOLUMETRIC_BUCKET_KIND;
  buckets: number;
  scrapBucketVolumeL: number;
  estimatedWeightPerLiterKg: number;
  defaultScrapCostPerKg: number;
  totalVolumeL: number;
  totalKg: number;
  estimatedDollars: number;
  loggedAt: string;
}

export function buildVolumetricScrapNotes(
  buckets: number,
  settings: Pick<
    PlatformSettings,
    'scrapBucketVolumeL' | 'estimatedWeightPerLiterKg' | 'defaultScrapCostPerKg'
  >
): VolumetricScrapNotePayload {
  const inputs = scrapBucketInputsFromSettings(settings);
  const totals = scrapTotalsForBucketCount(buckets, inputs);
  return {
    kind: SCRAP_VOLUMETRIC_BUCKET_KIND,
    buckets,
    scrapBucketVolumeL: settings.scrapBucketVolumeL,
    estimatedWeightPerLiterKg: settings.estimatedWeightPerLiterKg,
    defaultScrapCostPerKg: settings.defaultScrapCostPerKg,
    totalVolumeL: totals.totalVolumeL,
    totalKg: totals.totalKg,
    estimatedDollars: totals.totalDollars,
    loggedAt: new Date().toISOString(),
  };
}

export function serializeVolumetricScrapNotes(payload: VolumetricScrapNotePayload): string {
  return JSON.stringify(payload);
}

export function isVolumetricScrapNotes(notes: string | null | undefined): boolean {
  if (!notes) return false;
  if (notes.includes(SCRAP_VOLUMETRIC_BUCKET_KIND)) return true;
  const lower = notes.toLowerCase();
  return lower.includes('volumetric scrap') || lower.includes('cubeta');
}
