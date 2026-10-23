'use client';

import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { CORAL, EMERALD, chartCard } from '@/components/ui/chartColors';
import type { RescueSlice } from '@/lib/domains/stats/storeStatsTypes';
import { cn } from '@/lib/utils/cn';

const COLORS = [EMERALD, CORAL];

export function WasteVsRescueChart({ data }: { data: RescueSlice[] }) {
  const total = data.reduce((sum, slice) => sum + slice.units, 0);
  const slices = data.map((slice) => ({
    ...slice,
    percentOfTotal: total > 0 ? (slice.units / total) * 100 : 0,
  }));

  return (
    <article className={cn(chartCard, 'transition hover:border-slate-700')}>
      <h2 className="text-sm font-black text-slate-100">Rescue versus discard</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Units to kitchen vs waste bin.
      </p>
      {total <= 0 ? (
        <p className="flex h-72 items-center justify-center text-sm text-slate-500">No movements yet.</p>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="units"
                nameKey="name"
                innerRadius={58}
                outerRadius={86}
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
      <ul className="mt-2 flex flex-wrap gap-3 text-xs font-bold text-slate-300">
        {slices.map((slice, index) => (
          <li key={slice.name} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index] }} />
            {slice.name}: {slice.units}
          </li>
        ))}
      </ul>
    </article>
  );
}
