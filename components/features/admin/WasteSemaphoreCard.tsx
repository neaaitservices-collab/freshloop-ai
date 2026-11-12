'use client';

import { cn } from '@/lib/utils/cn';

/** Lost share that lights Control. Not the sales waste ratio. */
export const CONTROL_LOST_GOAL_PCT = 10;

/** discarded / (rescued + discarded), in percent. Null when nothing was handled. */
export function lostSharePct(rescued: number, discarded: number): number | null {
  if (!Number.isFinite(rescued) || !Number.isFinite(discarded)) return null;
  const handled = rescued + discarded;
  if (!(handled > 0)) return null;
  return Number(((discarded / handled) * 100).toFixed(1));
}

export function controlStatus(
  lostPct: number | null,
  goal = CONTROL_LOST_GOAL_PCT
): 'over' | 'on' {
  if (lostPct != null && lostPct > goal) return 'over';
  return 'on';
}

function Lamp({ on, tone }: { on: boolean; tone: 'red' | 'amber' | 'green' }) {
  const lit = {
    red: 'bg-rose-400 shadow-[0_0_8px_2px_rgba(248,113,113,0.65)]',
    amber: 'bg-amber-400 shadow-[0_0_8px_2px_rgba(251,191,36,0.65)]',
    green: 'bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.65)]',
  } as const;
  const dim = {
    red: 'bg-rose-400/20',
    amber: 'bg-amber-400/20',
    green: 'bg-emerald-400/20',
  } as const;
  return <span className={cn('h-3.5 w-3.5 rounded-full', on ? lit[tone] : dim[tone])} />;
}

export function WasteSemaphoreCard({
  lostPct,
  pending = false,
}: {
  /** Lost % for the selected range. Null when rescued and discarded are both zero. */
  lostPct: number | null;
  pending?: boolean;
}) {
  const over = !pending && controlStatus(lostPct) === 'over';
  const onGoal = !pending && !over;
  const status = pending ? 'Updating…' : over ? 'Over goal' : 'On goal';

  return (
    <div
      className="flex items-start justify-between gap-3 border-t border-slate-800 py-3.5"
      aria-label={`Waste traffic light. ${status}. Goal ≤ ${CONTROL_LOST_GOAL_PCT}%.`}
    >
      <div>
        <p className="text-[13px] font-bold text-slate-300">Control</p>
        <p className="pt-0.5 text-xs font-semibold text-slate-500">{status}</p>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-black px-2 py-1"
          aria-hidden
        >
          <Lamp on={over} tone="red" />
          <Lamp on={false} tone="amber" />
          <Lamp on={onGoal} tone="green" />
        </div>
        <p className="text-[15px] font-black tracking-tight text-slate-50">
          ≤ {CONTROL_LOST_GOAL_PCT}%
        </p>
      </div>
    </div>
  );
}
