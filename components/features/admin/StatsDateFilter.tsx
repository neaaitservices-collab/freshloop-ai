'use client';

import React, { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  formatCardRangeLabel,
  last30StoreDays,
  presetRange,
  shiftStoreRange,
} from '@/lib/domains/stats/storeTime';
import { statsRangeQuerySchema } from '@/lib/security/schemas/statsRange';
import { cn } from '@/lib/utils/cn';

const CHIPS = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
] as const;

function readBounds(params: { get: (key: string) => string | null }): {
  from: string;
  to: string;
  preset: 'day' | 'week' | 'month' | null;
} | null {
  const preset = params.get('preset');
  const from = params.get('from');
  const to = params.get('to');
  if (preset === 'day' || preset === 'week' || preset === 'month') {
    return { ...presetRange(preset), preset };
  }
  if (from && to) return { from, to, preset: null };
  return null;
}

export function StatsDateFilter({
  defaultPreset = null,
  heading = 'Production transfers',
  compact = false,
}: {
  defaultPreset?: 'day' | 'week' | 'month' | null;
  heading?: string;
  /** Desktop header slot: chips stay on one row and align to the end. */
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const bounds = useMemo(
    () =>
      readBounds(params) ??
      (defaultPreset
        ? { ...presetRange(defaultPreset), preset: defaultPreset }
        : { ...last30StoreDays(), preset: null }),
    [params, defaultPreset]
  );
  const preset = params.get('preset') ?? (params.get('from') || params.get('to') ? null : defaultPreset);
  const fromValue = params.get('from') ?? bounds?.from ?? '';
  const toValue = params.get('to') ?? bounds?.to ?? '';

  const replace = (next: URLSearchParams) => {
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const writeRange = (from: string, to: string, keepPreset?: string | null) => {
    const parsed = statsRangeQuerySchema.safeParse(
      keepPreset ? { preset: keepPreset } : { from, to }
    );
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Invalid date range.');
      return;
    }
    setError(null);
    const next = new URLSearchParams(params.toString());
    next.delete('preset');
    next.delete('from');
    next.delete('to');
    if (keepPreset) next.set('preset', keepPreset);
    else {
      next.set('from', from);
      next.set('to', to);
    }
    replace(next);
  };

  const shift = (direction: -1 | 1) => {
    const current = bounds ?? presetRange('week');
    const next = shiftStoreRange(current.from, current.to, direction);
    writeRange(next.from, next.to);
  };

  const label = bounds ? formatCardRangeLabel(bounds.from, bounds.to) : 'Last 30 days';

  return (
    <div className={cn('space-y-2', compact ? 'w-auto' : 'w-full')}>
      <div className={cn('flex gap-3', compact ? 'flex-row flex-wrap items-center justify-end' : 'flex-col')}>
        <div className={compact ? 'text-right' : undefined}>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            {heading}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-100">{label}</p>
        </div>
        <div className={cn('flex gap-2', compact ? 'flex-wrap items-center justify-end' : 'w-full flex-col')}>
          <div className={cn('flex items-center gap-2', compact ? '' : 'w-full')}>
          <div className={cn(
            'rounded-xl border border-slate-700 bg-slate-950/80 p-0.5',
            compact ? 'inline-flex' : 'grid w-full grid-cols-3'
          )}>
            {(defaultPreset === 'day'
              ? ([['day', 'Today'], ['week', 'Week'], ['month', 'Month']] as const)
              : CHIPS
            ).map(([id, text]) => (
              <button
                key={id}
                type="button"
                aria-pressed={preset === id}
                onClick={() => writeRange('', '', id)}
                className={cn(
                  'min-h-11 rounded-lg px-3 text-xs font-black',
                  compact ? '' : 'w-full',
                  preset === id ? 'bg-blue-900/70 text-blue-50' : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                {text}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Previous range"
            onClick={() => shift(-1)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700 text-slate-200 hover:bg-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next range"
            onClick={() => shift(1)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700 text-slate-200 hover:bg-slate-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          </div>
          <label className={cn('text-xs font-bold text-slate-400', compact ? '' : 'w-full')}>
            From
            <input
              type="date"
              value={fromValue}
              onChange={(event) => writeRange(event.target.value, toValue || event.target.value)}
              className="mt-1 block min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100"
            />
          </label>
          <label className={cn('text-xs font-bold text-slate-400', compact ? '' : 'w-full')}>
            To
            <input
              type="date"
              value={toValue}
              onChange={(event) => writeRange(fromValue || event.target.value, event.target.value)}
              className="mt-1 block min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100"
            />
          </label>
        </div>
      </div>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
