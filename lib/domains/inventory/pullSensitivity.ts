import { z } from 'zod';

export const PULL_SENSITIVITY_OPTIONS = [2, 3, 4] as const;
export type PullSensitivityDays = (typeof PULL_SENSITIVITY_OPTIONS)[number];

/** Store default written by PATCH /api/admin/settings. Only 2, 3, or 4. */
export const storePullSensitivityDaysSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export function normalizePullSensitivityDays(value: unknown): PullSensitivityDays {
  if (value === 2 || value === 3 || value === 4) return value;
  return 3;
}

/** Stored on Product when set; null/undefined = inherit store default. */
export function parseProductPullOverride(value: unknown): PullSensitivityDays | null {
  if (value === 2 || value === 3 || value === 4) return value;
  return null;
}

export function effectivePullDays(
  productOverride: number | null | undefined,
  storeDefault: PullSensitivityDays
): PullSensitivityDays {
  const override = parseProductPullOverride(productOverride);
  return override ?? normalizePullSensitivityDays(storeDefault);
}

export function isInPullWindow(daysRemaining: number, pullDays: number): boolean {
  return daysRemaining <= pullDays;
}

/**
 * Short-dated floor queue. `labeledPullDays` is the window printed for that
 * row: the store default, or the per-SKU override when one is saved.
 */
export function inShortDatedTransferQueue(daysRemaining: number, labeledPullDays: number): boolean {
  return isInPullWindow(daysRemaining, labeledPullDays);
}

export function pullWindowLabel(days: PullSensitivityDays): string {
  if (days === 2) return 'Strict (2d)';
  if (days === 4) return 'Extended (4d)';
  return 'Standard (3d)';
}
