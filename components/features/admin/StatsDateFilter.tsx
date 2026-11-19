'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { InvoiceDateField } from '@/components/features/receive/InvoiceDateField';
import { capAdminDateBounds, resolveAdminDateRange } from '@/lib/domains/stats/adminDateRange';
import {
  ADMIN_DATE_PRESETS,
  torontoToday,
  type AdminDatePreset,
} from '@/lib/domains/stats/storeTime';
import { statsRangeQuerySchema } from '@/lib/security/schemas/statsRange';
import { cn } from '@/lib/utils/cn';

const CHIP_LABELS: Record<AdminDatePreset, string> = {
  today: 'Today',
  last7: 'Last 7 days',
  mtd: 'Month to date',
  lastMonth: 'Last month',
};

function StatsDateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  const presetParam = params.get('preset');
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const resolved = useMemo(
    () => resolveAdminDateRange({ preset: presetParam, from: fromParam, to: toParam }),
    [presetParam, fromParam, toParam]
  );
  const custom = resolved.mode === 'custom';
  const fromValue = draft?.from ?? resolved.from;
  const toValue = draft?.to ?? resolved.to;
  const storeToday = torontoToday();

  const replace = (next: URLSearchParams) => {
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const selectPreset = (id: AdminDatePreset) => {
    setError(null);
    setDraft(null);
    const next = new URLSearchParams(params.toString());
    next.delete('from');
    next.delete('to');
    next.set('preset', id);
    replace(next);
  };

  const selectCustom = () => {
    setError(null);
    setDraft(null);
    const next = new URLSearchParams(params.toString());
    next.delete('preset');
    next.set('from', resolved.from);
    next.set('to', resolved.to);
    replace(next);
  };

  const commitCustom = (from: string, to: string) => {
    const capped = capAdminDateBounds(from, to);
    const parsed = statsRangeQuerySchema.safeParse({ from: capped.from, to: capped.to });
    if (!parsed.success) {
      setDraft({ from, to });
      setError(parsed.error.errors[0]?.message ?? 'Invalid date range.');
      return;
    }
    setError(null);
    setDraft(null);
    const next = new URLSearchParams(params.toString());
    next.delete('preset');
    next.set('from', capped.from);
    next.set('to', capped.to);
    replace(next);
  };

  return (
    <div className="mt-3 space-y-2">
      <div
        className="flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-950 p-0.5"
        role="group"
        aria-label="Stats range"
      >
        {ADMIN_DATE_PRESETS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={resolved.preset === id}
            onClick={() => selectPreset(id)}
            className={cn(
              'min-h-11 rounded-lg px-3 text-xs font-black',
              resolved.preset === id ? 'bg-blue-900/70 text-blue-50' : 'text-slate-300 hover:bg-slate-800'
            )}
          >
            {CHIP_LABELS[id]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom}
          onClick={selectCustom}
          className={cn(
            'min-h-11 rounded-lg px-3 text-xs font-black',
            custom ? 'bg-blue-900/70 text-blue-50' : 'text-slate-300 hover:bg-slate-800'
          )}
        >
          Custom
        </button>
      </div>
      <p className="text-xs font-semibold text-slate-400">{resolved.label}</p>
      {custom ? (
        <div className="grid max-w-md grid-cols-2 gap-2">
          <InvoiceDateField
            label="From"
            value={fromValue}
            max={storeToday}
            onChange={(ymd) => commitCustom(ymd, toValue)}
          />
          <InvoiceDateField
            label="To"
            value={toValue}
            max={storeToday}
            onChange={(ymd) => commitCustom(fromValue, ymd)}
          />
        </div>
      ) : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}

export function AdminDateFilter() {
  return (
    <Suspense fallback={<div className="mt-3 h-16" aria-hidden />}>
      <StatsDateFilter />
    </Suspense>
  );
}
