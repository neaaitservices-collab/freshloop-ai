'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';
import {
  PULL_SENSITIVITY_OPTIONS,
  type PullSensitivityDays,
} from '@/lib/domains/inventory/pullSensitivity';

export function PullDaysToggle({
  value,
  onChange,
  storeDefault,
  allowStoreDefault = false,
  idPrefix = 'pull',
  className,
}: {
  /** null = use store default (when allowStoreDefault) */
  value: PullSensitivityDays | null;
  onChange: (days: PullSensitivityDays | null) => void;
  storeDefault: PullSensitivityDays;
  allowStoreDefault?: boolean;
  idPrefix?: string;
  className?: string;
}) {
  const usingStore = allowStoreDefault && value === null;

  return (
    <div className={cn('grid gap-2', allowStoreDefault ? 'sm:grid-cols-4' : 'grid-cols-3', className)}>
      {allowStoreDefault ? (
        <button
          type="button"
          id={`${idPrefix}-store`}
          onClick={() => onChange(null)}
          className={cn(
            'min-h-11 rounded-xl border px-2 py-2.5 text-xs font-bold transition',
            usingStore
              ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-200'
              : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
          )}
        >
          Store default
          <span className="mt-0.5 block font-mono text-[10px] font-medium text-slate-500">
            ≤{storeDefault}d
          </span>
        </button>
      ) : null}
      {PULL_SENSITIVITY_OPTIONS.map((days) => {
        const active = !usingStore && value === days;
        return (
          <button
            key={days}
            type="button"
            id={`${idPrefix}-${days}`}
            onClick={() => onChange(days)}
            className={cn(
              'min-h-11 rounded-xl border px-2 py-2.5 text-xs font-bold transition',
              active
                ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-200'
                : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
            )}
          >
            {days} days
            <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
              {days === 2 ? 'Strict' : days === 3 ? 'Standard' : 'Extended'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
