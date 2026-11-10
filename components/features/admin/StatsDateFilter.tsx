'use client';

import React, { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatRangeLabel, presetRange, shiftStoreRange } from '@/lib/domains/stats/storeTime';
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
}: {
  defaultPreset?: 'day' | 'week' | 'month' | null;
  heading?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const bounds = useMemo(() => readBounds(params) ?? (defaultPreset ? { ...presetRange(defaultPreset), preset: defaultPreset } : null), [params, defaultPreset]);
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

  const label = bounds ? formatRangeLabel(bounds.from, bounds.to) : 'Last 7 days';

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            {heading}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-100">{label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-950/80 p-0.5">
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
          <label className="text-[11px] font-bold text-slate-400">
            From
            <input
              type="date"
              value={fromValue}
              onChange={(event) => writeRange(event.target.value, toValue || event.target.value)}
              className="mt-1 block min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-[11px] font-bold text-slate-400">
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
