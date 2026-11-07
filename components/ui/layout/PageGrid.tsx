import React from 'react';
import { cn } from '@/lib/utils/cn';

export function PageGrid({
  children,
  className,
  gap = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  gap?: 'tight' | 'default' | 'loose';
}) {
  const gapClass =
    gap === 'tight' ? 'gap-3 md:gap-4' : gap === 'loose' ? 'gap-6 md:gap-8' : 'gap-4 md:gap-6';
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-12', gapClass, className)}>{children}</div>
  );
}

export function PageGridSpan({
  children,
  className,
  span = 12,
}: {
  children: React.ReactNode;
  className?: string;
  span?: 12 | 8 | 6 | 4 | 3;
}) {
  const spanClass =
    span === 12
      ? 'md:col-span-12'
      : span === 8
        ? 'md:col-span-8'
        : span === 6
          ? 'md:col-span-6'
          : span === 4
            ? 'md:col-span-4'
            : 'md:col-span-3';
  return <div className={cn('min-w-0', spanClass, className)}>{children}</div>;
}
