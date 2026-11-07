import React from 'react';
import { cn } from '@/lib/utils/cn';

/** Vertical rhythm for dashboard sections. */
export function SurfaceStack({
  children,
  className,
  gap = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  gap?: 'tight' | 'default' | 'loose';
}) {
  const gapClass = gap === 'tight' ? 'space-y-4' : gap === 'loose' ? 'space-y-8' : 'space-y-6';
  return <div className={cn(gapClass, className)}>{children}</div>;
}
