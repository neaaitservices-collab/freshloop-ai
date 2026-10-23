'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'destructive' | 'ocean';

const styles: Record<BadgeVariant, string> = {
  neutral: 'border-slate-700/80 bg-slate-800/60 text-slate-300',
  success: 'border-emerald-800/50 bg-emerald-950/30 text-emerald-400/90',
  warning: 'border-amber-800/40 bg-amber-950/25 text-amber-400/90',
  destructive: 'border-rose-900/50 bg-rose-950/30 text-rose-400',
  ocean: 'border-blue-800/50 bg-blue-900/40 text-blue-200',
};

export function Badge({
  variant = 'neutral',
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Shelf-life badge from days remaining */
export function DaysRemainingBadge({ days }: { days: number }) {
  if (days < 2) {
    return <Badge variant="destructive">{days}d pull</Badge>;
  }
  if (days <= 4) {
    return <Badge variant="warning">{days}d</Badge>;
  }
  return <Badge variant="success">{days}d</Badge>;
}
