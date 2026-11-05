'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';

const variantClass: Record<ButtonVariant, string> = {
  primary:
    'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 focus-visible:ring-slate-600',
  secondary:
    'border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800/80 focus-visible:ring-slate-600',
  ghost: 'border border-transparent text-slate-300 hover:bg-slate-800/50',
  success:
    'border border-emerald-800/50 bg-emerald-950/40 text-emerald-100 hover:bg-emerald-900/50 focus-visible:ring-emerald-700',
  danger:
    'border border-rose-900/50 bg-rose-950/30 text-rose-200 hover:bg-rose-950/50 focus-visible:ring-rose-800',
};

export function Button({
  variant = 'primary',
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition sm:min-h-[48px]',
        'focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50',
        variantClass[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
