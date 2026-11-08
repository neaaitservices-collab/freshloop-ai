'use client';

import React from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

export function VoicePipelineErrorBanner({
  message,
  onRetry,
  retryLabel = 'Retry',
  onDismiss,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-rose-500/50 bg-rose-950/50 px-3.5 py-3 text-rose-100">
      <div className="flex items-start gap-2.5">
        <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs font-semibold leading-relaxed">{message}</p>
          <div className="flex flex-wrap gap-2">
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-rose-400/40 bg-rose-950 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-rose-100 hover:bg-rose-900/60"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {retryLabel}
              </button>
            ) : null}
            {onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                className="inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-[11px] font-bold text-rose-200/80 hover:text-white"
              >
                Dismiss
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
