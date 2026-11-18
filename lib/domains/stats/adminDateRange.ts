import { statsRangeQuerySchema } from '@/lib/security/schemas/statsRange';
import {
  calendarDaysInclusive,
  DEFAULT_ADMIN_DATE_PRESET,
  formatAdminRangeLabel,
  presetRange,
  torontoRange,
  type StoreInstantRange,
  type StoreRangePreset,
} from '@/lib/domains/stats/storeTime';

export type AdminDateQuery = {
  preset?: string | string[] | null;
  from?: string | string[] | null;
  to?: string | string[] | null;
};

export type ResolvedAdminDateRange = {
  mode: 'preset' | 'custom';
  preset: StoreRangePreset | null;
  from: string;
  to: string;
  range: StoreInstantRange;
  dayCount: number;
  label: string;
};

function clean(value: string | string[] | null | undefined): string | undefined {
  if (Array.isArray(value)) return clean(value[0]);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function finish(
  bounds: { from: string; to: string },
  preset: StoreRangePreset | null
): ResolvedAdminDateRange {
  return {
    mode: preset ? 'preset' : 'custom',
    preset,
    from: bounds.from,
    to: bounds.to,
    range: torontoRange(bounds.from, bounds.to),
    dayCount: calendarDaysInclusive(bounds.from, bounds.to),
    label: formatAdminRangeLabel(bounds.from, bounds.to),
  };
}

function monthToDate(now: Date): ResolvedAdminDateRange {
  return finish(presetRange(DEFAULT_ADMIN_DATE_PRESET, now), DEFAULT_ADMIN_DATE_PRESET);
}

/** Invalid or empty query params become month-to-date. day/week/month still resolve. */
export function resolveAdminDateRange(query?: AdminDateQuery | null, now = new Date()): ResolvedAdminDateRange {
  const parsed = statsRangeQuerySchema.safeParse({
    preset: clean(query?.preset),
    from: clean(query?.from),
    to: clean(query?.to),
  });
  if (!parsed.success) return monthToDate(now);
  if (parsed.data.preset) return finish(presetRange(parsed.data.preset, now), parsed.data.preset);
  if (parsed.data.from && parsed.data.to) return finish({ from: parsed.data.from, to: parsed.data.to }, null);
  return monthToDate(now);
}

export function resolveAdminDateSearch(
  raw?: AdminDateQuery | null,
  now = new Date()
): ResolvedAdminDateRange {
  return resolveAdminDateRange(raw, now);
}

/** Preset id, or the custom from/to pair, after the same fallback the pages use. */
export function adminPeriodRequest(
  query?: AdminDateQuery | null,
  now = new Date()
): StoreRangePreset | { from: string; to: string } {
  const resolved = resolveAdminDateRange(query, now);
  if (resolved.mode === 'custom') return { from: resolved.from, to: resolved.to };
  return resolved.preset ?? DEFAULT_ADMIN_DATE_PRESET;
}
