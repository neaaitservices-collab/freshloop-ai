'use client';

import React, { useEffect } from 'react';
import { cn } from '@/lib/utils/cn';

export function Toast({
  message,
  onDismiss,
  variant = 'neutral',
  durationMs = 3200,
}: {
  message: string | null;
  onDismiss: () => void;
  variant?: 'neutral' | 'success' | 'warning' | 'destructive';
  durationMs?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(t);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  const tone =
    variant === 'success'
      ? 'border-emerald-800/50 text-emerald-100'
      : variant === 'warning'
        ? 'border-amber-800/50 text-amber-100'
        : variant === 'destructive'
          ? 'border-rose-900/50 text-rose-100'
          : 'border-slate-700 text-slate-100';

  return (
    <div
      role="status"
      className={cn(
        'fixed bottom-24 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-2xl border bg-slate-900/95 px-4 py-3 text-sm font-semibold shadow-xl backdrop-blur-md md:bottom-8',
        tone
      )}
    >
      {message}
    </div>
  );
}
