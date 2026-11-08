'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import {
  formatVoiceClock,
  voicePipelineStatusLabel,
  type VoicePipelinePhase,
} from '@/lib/features/voicePipelineUi';
import { cn } from '@/lib/utils/cn';

export function VoicePipelineStatusBar({
  phase,
  recordingSeconds = 0,
  maxRecordingSeconds,
  className,
}: {
  phase: VoicePipelinePhase;
  recordingSeconds?: number;
  maxRecordingSeconds: number;
  className?: string;
}) {
  if (phase === 'idle') return null;

  const processing =
    phase === 'compressing' ||
    phase === 'uploading' ||
    phase === 'transcribing' ||
    phase === 'parsing';
  const nearCap = phase === 'recording' && recordingSeconds >= maxRecordingSeconds - 10;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold uppercase tracking-wider',
        phase === 'recording'
          ? nearCap
            ? 'border-amber-500/50 bg-amber-950/40 text-amber-200'
            : 'border-rose-500/40 bg-rose-950/35 text-rose-100'
          : 'border-teal-500/35 bg-teal-950/30 text-teal-100',
        className
      )}
      aria-live="polite"
    >
      {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : null}
      {phase === 'recording' ? (
        <span className="font-mono tabular-nums">
          {formatVoiceClock(recordingSeconds)} / {formatVoiceClock(maxRecordingSeconds)}
        </span>
      ) : null}
      <span>{voicePipelineStatusLabel(phase)}</span>
    </div>
  );
}
