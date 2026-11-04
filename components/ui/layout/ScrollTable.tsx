'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

/** Horizontal scroll wrapper for data tables (mobile-safe). */
export function ScrollTable({
  children,
  className,
  minWidthClass = 'min-w-0',
}: {
  children: React.ReactNode;
  className?: string;
  /** e.g. min-w-[720px] on the inner table; outer keeps min-w-0 for flex parents. */
  minWidthClass?: string;
}) {
  return (
    <div className={cn('min-w-0 overflow-x-auto overscroll-x-contain', minWidthClass, className)}>
      {children}
    </div>
  );
}
