'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

/** Shared admin dashboard surface (dark card, generous padding). */
export const dashboardCardClassName =
  'rounded-2xl border border-slate-800/90 bg-slate-900/60 p-6 shadow-lg shadow-black/15';

export function DashboardCard({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn(dashboardCardClassName, className)} {...props}>
      {children}
    </div>
  );
}
