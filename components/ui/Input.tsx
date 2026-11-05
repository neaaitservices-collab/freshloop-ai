'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 sm:min-h-[48px]',
        'outline-none transition focus:border-slate-500 focus:ring-1 focus:ring-slate-600',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-200 sm:min-h-[48px]',
        'outline-none transition focus:border-slate-500 focus:ring-1 focus:ring-slate-600',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
