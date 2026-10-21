'use client';

import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { chartCard, CORAL, OCEAN } from '@/components/admin/chartColors';
import { ChartTooltip } from '@/components/admin/ChartTooltip';
import type { RescueSlice } from '@/lib/storeStatsTypes';

const COLORS = [OCEAN, CORAL];

export function WasteVsRescueChart({ data }: { data: RescueSlice[] }) {
  const total = data.reduce((sum, slice) => sum + slice.units, 0);
  const slices = data.map((slice) => ({
    ...slice,
    percentOfTotal: total > 0 ? (slice.units / total) * 100 : 0,
  }));

  return (
    <article className={chartCard}>
      <h2 className="text-sm font-black text-slate-100">Rescue versus discard</h2>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
        Units moved to the kitchen compared with units discarded.
      </p>
      {total <= 0 ? (
        <p className="flex h-40 items-center justify-center text-sm text-slate-500">
          No rescue or discard movements yet.
        </p>
      ) : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="units"
                nameKey="name"
                innerRadius={36}
                outerRadius={58}
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
      <ul className="mt-2 flex flex-wrap gap-3 text-xs font-bold">
        {slices.map((slice, index) => (
          <li key={slice.name} className="flex items-center gap-1.5 text-zinc-300">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index] }} />
            <span className="text-slate-300">
              {slice.name}: {slice.units}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
