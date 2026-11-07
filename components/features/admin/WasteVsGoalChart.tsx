'use client';

import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { AMBER, GRID, TEAL, TICK } from '@/components/ui/chartColors';
import { DashboardCard } from '@/components/features/admin/DashboardCard';
import type { RescueOutcomeDay } from '@/lib/domains/stats/storeStatsTypes';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';
import { cn } from '@/lib/utils/cn';

function dailyWasteSharePct(day: RescueOutcomeDay): number {
  const handled = day.lostUsd + day.recoveredUsd;
  if (handled <= 0) return 0;
  return Number(((day.lostUsd / handled) * 100).toFixed(1));
}

export function WasteVsGoalChart({
  days,
  goalPct,
  className,
}: {
  days: RescueOutcomeDay[];
  goalPct: number;
  className?: string;
}) {
  const rows = useMemo(
    () =>
      days.map((day) => ({
        label: day.label,
        pct: dailyWasteSharePct(day),
        overGoal: dailyWasteSharePct(day) > goalPct,
      })),
    [days, goalPct]
  );

  const projectedWasteUsd = useMemo(
    () => days.reduce((sum, day) => sum + day.lostUsd, 0),
    [days]
  );

  return (
    <DashboardCard className={cn('flex min-h-0 flex-col', className)}>
      <header className="shrink-0">
        <h2 className="text-base font-black tracking-tight text-slate-100">Waste vs. goal</h2>
        <p className="mt-1 text-sm text-slate-400">
          Daily discard share of handled retail $ (last 7 days)
        </p>
        <p className="mt-2 font-mono text-xs font-bold tabular-nums text-amber-200/90">
          Projected waste (7d):{' '}
          <span className="text-sm text-slate-100">{formatCurrency(projectedWasteUsd)}</span>
        </p>
      </header>

      <div className="mt-4 min-h-[260px] w-full flex-1 lg:min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 16, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fill: TICK, fontSize: 12, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
              dy={8}
            />
            <YAxis
              tick={{ fill: TICK, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 'auto']}
            />
            <ReferenceLine
              y={goalPct}
              stroke={AMBER}
              strokeDasharray="4 4"
              label={{
                value: `Goal: ${goalPct}%`,
                position: 'insideTopRight',
                fill: AMBER,
                fontSize: 11,
                fontWeight: 700,
              }}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar dataKey="pct" name="Waste share" radius={[6, 6, 0, 0]} animationDuration={700}>
              {rows.map((row) => (
                <Cell
                  key={row.label}
                  fill={row.overGoal ? AMBER : TEAL}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  );
}
