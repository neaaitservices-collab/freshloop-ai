'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

export function ParCasesToggle({
  followStoreDefault,
  onFollowStoreDefaultChange,
  customCases,
  onCustomCasesChange,
  storeDefault,
  idPrefix = 'par',
  className,
}: {
  followStoreDefault: boolean;
  onFollowStoreDefaultChange: (follow: boolean) => void;
  customCases: string;
  onCustomCasesChange: (raw: string) => void;
  storeDefault: number;
  idPrefix?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end', className)}>
      <button
        type="button"
        id={`${idPrefix}-store`}
        onClick={() => onFollowStoreDefaultChange(true)}
        className={cn(
          'min-h-11 flex-1 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition sm:max-w-[11rem]',
          followStoreDefault
            ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-200'
            : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
        )}
      >
        Store default
        <span className="mt-0.5 block font-mono text-[10px] font-medium text-slate-500">
          {storeDefault} {storeDefault === 1 ? 'case' : 'cases'}
        </span>
      </button>
      <button
        type="button"
        id={`${idPrefix}-custom`}
        onClick={() => onFollowStoreDefaultChange(false)}
        className={cn(
          'min-h-11 shrink-0 rounded-xl border px-3 py-2.5 text-xs font-bold transition sm:w-28',
          !followStoreDefault
            ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-200'
            : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
        )}
      >
        Custom
      </button>
      <label
        className={cn(
          'min-w-0 flex-1',
          followStoreDefault && 'pointer-events-none opacity-45'
        )}
      >
        <span className="sr-only">Alert level in cases</span>
        <input
          type="number"
          min={0}
          max={999}
          step={1}
          inputMode="numeric"
          disabled={followStoreDefault}
          value={customCases}
          onChange={(event) => onCustomCasesChange(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-slate-700/90 bg-slate-950 px-3.5 py-2.5 font-mono text-sm font-bold text-slate-100 outline-none transition focus:border-emerald-500/45 focus:ring-1 focus:ring-emerald-500/20 disabled:border-slate-800"
        />
      </label>
    </div>
  );
}
