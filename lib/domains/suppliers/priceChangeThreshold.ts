import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/** Used when the store has no settings row yet. */
export const DEFAULT_PRICE_CHANGE_THRESHOLD_PCT = 8;

/** Stored percent, or 8 when the row or value is missing. */
export function resolvePriceChangeThresholdPct(stored: number | null | undefined): number {
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored;
  return DEFAULT_PRICE_CHANGE_THRESHOLD_PCT;
}

/** True when this database has not applied the price-change threshold column yet. */
export function isMissingPriceChangeColumn(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  if (!/price_change_threshold_pct|priceChangeThresholdPct/.test(message)) return false;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') return true;
  return /does not exist|not available/i.test(message);
}

type ThresholdRow = { priceChangeThresholdPct?: number | null } | null;

async function readStoredPriceChangeThreshold(): Promise<ThresholdRow> {
  return prisma.storeSetting.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { priceChangeThresholdPct: true },
  });
}

/**
 * Newest store setting percent, or 8 when no row is stored.
 * A missing column returns 8 so settings and stats keep loading before the migration.
 */
export async function getPriceChangeThresholdPct(
  read: () => Promise<ThresholdRow> = readStoredPriceChangeThreshold
): Promise<number> {
  try {
    const row = await read();
    return resolvePriceChangeThresholdPct(row?.priceChangeThresholdPct);
  } catch (error) {
    if (isMissingPriceChangeColumn(error)) return DEFAULT_PRICE_CHANGE_THRESHOLD_PCT;
    throw error;
  }
}
