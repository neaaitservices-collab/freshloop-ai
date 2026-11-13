import type { AdminPeriodFigures } from '@/lib/domains/stats/storeStatsTypes';

export const PERIOD_PRESETS = ['day', 'week', 'month'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export type PeriodLoadResult =
  | { ok: true; preset: PeriodPreset; figures: AdminPeriodFigures }
  | { ok: false; aborted: true }
  | { ok: false; aborted: false; error: string };

const PERIOD_CLIENT_TTL_MS = 60_000;

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isPeriodPreset(value: string): value is PeriodPreset {
  return PERIOD_PRESETS.includes(value as PeriodPreset);
}

export function periodFiguresQuery(preset: PeriodPreset): string {
  return `/api/admin/stats?preset=${encodeURIComponent(preset)}&scope=period`;
}

function readFigures(value: unknown): AdminPeriodFigures | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const rescuedValue = Number(row.rescuedValue);
  const lostValue = Number(row.lostValue);
  const scrapDollars = Number(row.scrapDollars);
  const scrapBuckets = Number(row.scrapBuckets);
  const sales = Number(row.sales);
  if (
    ![rescuedValue, lostValue, scrapDollars, scrapBuckets, sales].every((item) =>
      Number.isFinite(item)
    )
  ) {
    return null;
  }
  if ('inventoryValue' in row) return null;
  return { rescuedValue, lostValue, scrapDollars, scrapBuckets, sales };
}

/**
 * Period-only fetch for the stats chips.
 * A newer load aborts the previous request and drops its result.
 * Prefetch uses its own controller so it cannot cancel the chip the user tapped.
 */
export function createPeriodLoader(fetchImpl: typeof fetch = globalThis.fetch) {
  const cache = new Map<PeriodPreset, { at: number; figures: AdminPeriodFigures }>();
  let controller: AbortController | null = null;
  let ticket = 0;

  const peek = (preset: PeriodPreset): AdminPeriodFigures | null => {
    const hit = cache.get(preset);
    if (!hit) return null;
    if (Date.now() - hit.at > PERIOD_CLIENT_TTL_MS) {
      cache.delete(preset);
      return null;
    }
    return hit.figures;
  };

  const pull = async (preset: PeriodPreset, signal: AbortSignal): Promise<PeriodLoadResult> => {
    const res = await fetchImpl(periodFiguresQuery(preset), { signal, cache: 'no-store' });
    const json = (await res.json().catch(() => null)) as
      | { success?: boolean; error?: string; period?: unknown; stats?: unknown }
      | null;
    if (json && 'stats' in json && json.stats) {
      return { ok: false, aborted: false, error: 'Could not refresh dashboard stats.' };
    }
    const figures = json?.period ? readFigures(json.period) : null;
    if (!res.ok || !json?.success || !figures) {
      return {
        ok: false,
        aborted: false,
        error: json?.error || 'Could not refresh dashboard stats.',
      };
    }
    cache.set(preset, { at: Date.now(), figures });
    return { ok: true, preset, figures };
  };

  return {
    peek,
    invalidate() {
      cache.clear();
    },
    abort() {
      controller?.abort();
      controller = null;
      ticket += 1;
    },
    async load(preset: PeriodPreset): Promise<PeriodLoadResult> {
      if (!isPeriodPreset(preset)) {
        return { ok: false, aborted: false, error: 'Could not refresh dashboard stats.' };
      }
      controller?.abort();
      controller = null;
      const myTicket = ++ticket;
      const cached = peek(preset);
      if (cached) return { ok: true, preset, figures: cached };
      const mine = new AbortController();
      controller = mine;
      try {
        const result = await pull(preset, mine.signal);
        if (myTicket !== ticket) return { ok: false, aborted: true };
        return result;
      } catch (error) {
        if (myTicket !== ticket || isAbort(error)) return { ok: false, aborted: true };
        return { ok: false, aborted: false, error: 'Network error — showing last loaded stats.' };
      }
    },
    async prefetch(preset: PeriodPreset): Promise<void> {
      if (!isPeriodPreset(preset) || peek(preset)) return;
      const mine = new AbortController();
      try {
        await pull(preset, mine.signal);
      } catch {
        cache.delete(preset);
      }
    },
  };
}
