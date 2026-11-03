'use client';

import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { CORAL, EMERALD } from '@/components/ui/chartColors';
import type { RescueSlice } from '@/lib/domains/stats/storeStatsTypes';
import { DashboardCard } from '@/components/features/admin/DashboardCard';
import { cn } from '@/lib/utils/cn';

const COLORS = [EMERALD, CORAL];

export function WasteVsRescueChart({
  data,
  className,
}: {
  data: RescueSlice[];
  className?: string;
}) {
  const total = data.reduce((sum, slice) => sum + slice.units, 0);
  const slices = data.map((slice) => ({
    ...slice,
    percentOfTotal: total > 0 ? (slice.units / total) * 100 : 0,
  }));

  return (
    <DashboardCard className={cn('flex flex-col', className)}>
      <header>
        <h2 className="text-base font-black text-slate-100">Rescue versus discard</h2>
        <p className="mt-1 text-sm text-slate-400">Daily production &amp; waste breakdown</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Product units only — volumetric scrap buckets feed the waste semáforo above.
        </p>
      </header>

      {total <= 0 ? (
        <p className="flex min-h-[280px] flex-1 items-center justify-center text-sm text-slate-500">
          No movements yet.
        </p>
      ) : (
        <div className="mx-auto mt-4 w-full max-w-[280px] flex-1 min-h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="units"
                nameKey="name"
                innerRadius={64}
                outerRadius={96}
                paddingAngle={3}
                stroke="transparent"
                animationDuration={700}
              >
                {slices.map((slice, index) => (
                  <Cell key={slice.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <ul className="mt-4 flex flex-col gap-2 border-t border-slate-800/80 pt-4 sm:flex-row sm:flex-wrap sm:gap-4">
        {slices.map((slice, index) => (
          <li key={slice.name} className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: COLORS[index] }}
              aria-hidden
            />
            {slice.name}:{' '}
            <span className="font-mono text-base text-white">{slice.units}</span>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
