'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRightLeft, Clock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const PULL_DAYS = [2, 3, 4] as const;
type PullDays = (typeof PULL_DAYS)[number];

export function HumanPullSettingCard({
  pullDays,
  onPullDaysChange,
  flaggedSkuCount,
  atRiskRetailValue,
  batchRescueBusy,
  onBatchRescue,
}: {
  pullDays: PullDays;
  onPullDaysChange: (days: PullDays) => void;
  flaggedSkuCount: number;
  atRiskRetailValue: number;
  batchRescueBusy: boolean;
  onBatchRescue: () => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-800/90 bg-slate-900/80 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            Pull window
          </p>
          <p className="mt-1 text-xs leading-snug text-slate-400">
            Flag floor lots expiring within N days for kitchen rescue.
          </p>
        </div>
      </div>

      <div
        className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-slate-800 bg-slate-950/80 p-1"
        role="group"
        aria-label="Days until expiration pull threshold"
      >
        {PULL_DAYS.map((days) => {
          const active = pullDays === days;
          return (
            <button
              key={days}
              type="button"
              onClick={() => onPullDaysChange(days)}
              className={cn(
                'rounded-lg py-2 text-center text-xs font-black transition',
                active
                  ? 'bg-emerald-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
              )}
            >
              {days}d
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] font-bold text-slate-500">
        {pullDays === 2 ? 'Strict' : pullDays === 3 ? 'Standard' : 'Extended'} · ≤{pullDays} days
        left
      </p>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
        <div className="min-w-0 text-[11px] leading-snug">
          <span className="font-black text-amber-200">{flaggedSkuCount} SKUs</span>
          <span className="text-amber-200/80"> in window</span>
          <span className="mt-0.5 block font-mono text-[10px] text-amber-400/90">
            ${atRiskRetailValue.toFixed(2)} retail at risk
          </span>
        </div>
      </div>

      {flaggedSkuCount > 0 ? (
        <button
          type="button"
          disabled={batchRescueBusy}
          onClick={onBatchRescue}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-400 py-2.5 text-xs font-black text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          {batchRescueBusy ? 'Rescuing…' : `Batch rescue (${flaggedSkuCount})`}
        </button>
      ) : null}

      <Link
        href="/admin/settings#waste-pulls"
        className="mt-auto pt-3 text-[10px] font-bold text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
      >
        Default pull window · Store settings
      </Link>
    </div>
  );
}
