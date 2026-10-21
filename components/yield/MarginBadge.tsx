'use client';

import React from 'react';
import { formatPercent, marginTone } from '@/lib/yieldPricing';

export function MarginBadge({ currentMarginPct }: { currentMarginPct: number | null }) {
  const tone = marginTone(currentMarginPct);
  const label = `${formatPercent(currentMarginPct)}%`;

  const className =
    tone === 'healthy'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40'
      : tone === 'thin'
        ? 'bg-orange-500/15 text-orange-300 border-orange-400/40'
        : 'bg-zinc-800 text-zinc-400 border-zinc-700';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black ${className}`}>
      {label}
    </span>
  );
}
