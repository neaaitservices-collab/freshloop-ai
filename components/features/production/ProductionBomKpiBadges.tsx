'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

export interface ProductionBomSummary {
  totalRecipes: number;
  belowPar: number;
  totalYield: number;
  avgMargin: number;
}

export function ProductionBomKpiBadges({ summary }: { summary: ProductionBomSummary }) {
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
    <div className="-mx-1 flex gap-2 overflow-x-auto pb-0.5 snap-x snap-mandatory [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            'shrink-0 snap-start rounded-xl border px-3 py-2 sm:px-4 sm:py-2.5 lg:shrink',
            item.highlight
              ? 'border-rose-500/40 bg-rose-950/40'
              : 'border-slate-700/80 bg-slate-900/80'
          )}
        >
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
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
