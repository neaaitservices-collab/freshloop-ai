import { prisma } from '@/lib/db/prisma';

/** Used when the store has no settings row yet. */
export const DEFAULT_PRICE_CHANGE_THRESHOLD_PCT = 8;

/** Stored percent, or 8 when the row or value is missing. */
export function resolvePriceChangeThresholdPct(stored: number | null | undefined): number {
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored;
  return DEFAULT_PRICE_CHANGE_THRESHOLD_PCT;
}

/** Newest store setting percent, or 8 when no row is stored. */
export async function getPriceChangeThresholdPct(): Promise<number> {
  const row = await prisma.storeSetting.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { priceChangeThresholdPct: true },
  });
  return resolvePriceChangeThresholdPct(row?.priceChangeThresholdPct);
}
