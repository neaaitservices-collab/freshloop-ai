'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

export interface ProductionBomSummary {
  totalRecipes: number;
  belowPar: number;
  totalYield: number;
  avgMargin: number;
}

export function ProductionBomKpiBadges({
  summary,
  loading = false,
}: {
  summary: ProductionBomSummary;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-xl border border-slate-800 bg-slate-900/80" />
        ))}
      </div>
    );
  }
  const items = [
    { label: 'Total recipes', value: String(summary.totalRecipes), tone: 'text-white' },
    {
      label: 'Below par',
      value: String(summary.belowPar),
      tone: summary.belowPar > 0 ? 'text-rose-400' : 'text-slate-300',
      highlight: summary.belowPar > 0,
    },
    {
      label: 'Projected yield',
      value: `${summary.totalYield} portions`,
      tone: 'text-emerald-300',
    },
    {
      label: 'Avg. margin',
      value: `${summary.avgMargin.toFixed(1)}%`,
      tone: 'text-emerald-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            'min-w-0 rounded-xl border px-3 py-2 sm:px-4 sm:py-2.5',
            item.highlight
              ? 'border-rose-500/40 bg-rose-950/40'
              : 'border-slate-700/80 bg-slate-900/80'
          )}
        >
          <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
            {item.label}
          </p>
          <p className={cn('mt-0.5 font-mono text-sm font-black tabular-nums sm:text-base', item.tone)}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
