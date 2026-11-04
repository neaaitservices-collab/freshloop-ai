'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

const WIDTH = {
  md: 'max-w-3xl',
  lg: 'max-w-4xl',
  xl: 'max-w-7xl',
  wide: 'max-w-[90rem]',
} as const;

/** Standard page shell: centered, responsive padding, safe overflow. */
export function PageMain({
  children,
  width = 'xl',
  className,
}: {
  children: React.ReactNode;
  width?: keyof typeof WIDTH;
  className?: string;
}) {
  return (
    <main
      className={cn(
        'mx-auto w-full min-w-0 flex-1 overflow-x-clip px-3 py-5 pb-28 sm:px-6 sm:py-8 sm:pb-12',
        WIDTH[width],
        className
      )}
    >
      {children}
    </main>
  );
}
