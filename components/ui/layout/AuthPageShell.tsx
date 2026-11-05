'use client';

import React from 'react';
import { PageMain } from '@/components/ui/layout/PageMain';
import { cn } from '@/lib/utils/cn';

/** Centered auth card on full viewport — uses PageMain for consistent padding and touch-safe bottom space. */
export function AuthPageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-950 text-slate-100">
      <PageMain width="md" className={cn('flex flex-1 flex-col justify-center py-10 sm:py-12', className)}>
        <div className="w-full rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl sm:p-8">
          {children}
        </div>
      </PageMain>
    </div>
  );
}
