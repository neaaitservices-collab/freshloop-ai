import { Prisma } from '@prisma/client';
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

/** Reference prefix or scrap notes. One check for waste KPI SQL and spoilage counts. */
export function isVolumetricScrapLedgerRow(row: {
  referenceId?: string | null;
  notes?: string | null;
}): boolean {
  if (row.referenceId?.startsWith(VOLUMETRIC_SCRAP_REF_PREFIX)) return true;
  return isVolumetricScrapNotes(row.notes);
}

/**
 * SQL boolean for the waste aggregate. Column text is fixed; markers are bound.
 * Matches `isVolumetricScrapLedgerRow`.
 */
export function volumetricScrapSqlPredicate(): Prisma.Sql {
  const prefix = `${VOLUMETRIC_SCRAP_REF_PREFIX}%`;
  const kind = `%${SCRAP_VOLUMETRIC_BUCKET_KIND}%`;
  return Prisma.sql`(
    "Reference_ID" LIKE ${prefix}
    OR COALESCE("notes", '') LIKE ${kind}
    OR LOWER(COALESCE("notes", '')) LIKE '%volumetric scrap%'
    OR LOWER(COALESCE("notes", '')) LIKE '%cubeta%'
  )`;
}

/** Notes half of the scrap exclusion. Pair with `excludeVolumetricScrapFromStock()`. */
export function excludeVolumetricScrapNotes(): Prisma.InventoryTransactionWhereInput {
  return {
    OR: [
      { notes: null },
      {
        NOT: {
          OR: [
            { notes: { contains: SCRAP_VOLUMETRIC_BUCKET_KIND } },
            { notes: { contains: 'volumetric scrap', mode: 'insensitive' } },
            { notes: { contains: 'cubeta', mode: 'insensitive' } },
          ],
        },
      },
    ],
  };
}
