import type { AdminPeriodFigures } from '@/lib/domains/stats/storeStatsTypes';
import {
  isValidYmd,
  presetRange,
  statsBoundsCacheKey,
  STORE_RANGE_PRESETS,
  torontoRange,
  type StoreRangePreset,
} from '@/lib/domains/stats/storeTime';

export const PERIOD_PRESETS = ['day', 'week', 'month'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export type PeriodRangeRequest = StoreRangePreset | { from: string; to: string };

export type PeriodLoadResult =
  | { ok: true; preset: string; figures: AdminPeriodFigures }
  | { ok: false; aborted: true }
  | { ok: false; aborted: false; error: string };

export type TaggedPeriodFigures = {
  preset: string;
  figures: AdminPeriodFigures;
};

export function periodRequestId(request: PeriodRangeRequest): string {
  if (typeof request === 'string') return request;
  return `${request.from}|${request.to}`;
}

/** Show a period only under the chip that loaded it. */
export function figuresForSelectedPreset(
  selected: string,
  tagged: TaggedPeriodFigures | null
): AdminPeriodFigures | null {
  if (!tagged || tagged.preset !== selected) return null;
  return tagged.figures;
}

/**
 * Apply one period response to the selected chip.
 * A failure drops figures that belong to a different chip so the new label
 * cannot keep showing the previous range.
 */
export function applyPeriodLoad(
  selected: string,
  current: TaggedPeriodFigures | null,
  result: PeriodLoadResult
): { ignored: boolean; figures: TaggedPeriodFigures | null; error: string | null } {
  if (!result.ok) {
    if (result.aborted) return { ignored: true, figures: current, error: null };
    return {
      ignored: false,
      figures: current?.preset === selected ? current : null,
      error: result.error,
    };
  }
  if (result.preset !== selected) return { ignored: true, figures: current, error: null };
  return {
    ignored: false,
    figures: { preset: result.preset, figures: result.figures },
    error: null,
  };
}

const PERIOD_CLIENT_TTL_MS = 60_000;

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isStorePreset(value: string): value is StoreRangePreset {
  return (STORE_RANGE_PRESETS as readonly string[]).includes(value);
}

function boundsFor(request: PeriodRangeRequest, now: Date): { from: string; to: string } | null {
  if (typeof request === 'string') {
    if (!isStorePreset(request)) return null;
    return presetRange(request, now);
  }
  if (!isValidYmd(request.from) || !isValidYmd(request.to) || request.from > request.to) return null;
  return request;
}

export function periodFiguresQuery(request: PeriodRangeRequest): string {
  if (typeof request === 'string') {
    return `/api/admin/stats?preset=${encodeURIComponent(request)}&scope=period`;
  }
  const params = new URLSearchParams({
    from: request.from,
    to: request.to,
    scope: 'period',
  });
  return `/api/admin/stats?${params.toString()}`;
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
 * Cache keys are the UTC bounds plus the Toronto calendar day.
 */
export function createPeriodLoader(
  fetchImpl: typeof fetch = globalThis.fetch,
  now: () => Date = () => new Date()
) {
  const cache = new Map<string, { at: number; figures: AdminPeriodFigures }>();
  let controller: AbortController | null = null;
  let ticket = 0;

  const cacheKey = (request: PeriodRangeRequest): string | null => {
    const bounds = boundsFor(request, now());
    if (!bounds) return null;
    return statsBoundsCacheKey(torontoRange(bounds.from, bounds.to), now());
  };

  const peek = (request: PeriodRangeRequest): AdminPeriodFigures | null => {
    const key = cacheKey(request);
    if (!key) return null;
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > PERIOD_CLIENT_TTL_MS) {
      cache.delete(key);
      return null;
    }
    return hit.figures;
  };

  const pull = async (request: PeriodRangeRequest, signal: AbortSignal): Promise<PeriodLoadResult> => {
    const key = cacheKey(request);
    if (!key) return { ok: false, aborted: false, error: 'Could not refresh dashboard stats.' };
    const res = await fetchImpl(periodFiguresQuery(request), { signal, cache: 'no-store' });
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
    cache.set(key, { at: Date.now(), figures });
    return { ok: true, preset: periodRequestId(request), figures };
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
    async load(request: PeriodRangeRequest): Promise<PeriodLoadResult> {
      if (!boundsFor(request, now())) {
        return { ok: false, aborted: false, error: 'Could not refresh dashboard stats.' };
      }
      controller?.abort();
      controller = null;
      const myTicket = ++ticket;
      const cached = peek(request);
      if (cached) return { ok: true, preset: periodRequestId(request), figures: cached };
      const mine = new AbortController();
      controller = mine;
      try {
        const result = await pull(request, mine.signal);
        if (myTicket !== ticket) return { ok: false, aborted: true };
        return result;
      } catch (error) {
        if (myTicket !== ticket || isAbort(error)) return { ok: false, aborted: true };
        return { ok: false, aborted: false, error: 'Network error — showing last loaded stats.' };
      }
    },
    async prefetch(request: PeriodRangeRequest): Promise<void> {
      if (!boundsFor(request, now()) || peek(request)) return;
      const mine = new AbortController();
      try {
        await pull(request, mine.signal);
      } catch {
        const key = cacheKey(request);
        if (key) cache.delete(key);
      }
    },
  };
}
