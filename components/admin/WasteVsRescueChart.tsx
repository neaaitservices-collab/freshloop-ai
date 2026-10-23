'use client';

import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartTooltip } from '@/components/admin/ChartTooltip';
import type { RescueSlice } from '@/lib/storeStatsTypes';

const COLORS = ['#34d399', '#fb7185'];

export function WasteVsRescueChart({ data }: { data: RescueSlice[] }) {
  const total = data.reduce((sum, slice) => sum + slice.units, 0);
  const slices = data.map((slice) => ({
    ...slice,
    percentOfTotal: total > 0 ? (slice.units / total) * 100 : 0,
  }));

  return (
    <article className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-xl shadow-black/20 backdrop-blur-sm transition hover:border-emerald-500/30">
      <h2 className="text-sm font-black text-white">Rescue versus discard</h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
        Retail units moved to the kitchen compared with units discarded.
      </p>
      {total <= 0 ? (
        <p className="flex h-64 items-center justify-center text-sm text-zinc-500">
          No rescue or discard movements yet.
        </p>
      ) : (
        <div className="h-64">
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
      <ul className="mt-2 flex flex-wrap gap-3 text-xs font-bold">
        {slices.map((slice, index) => (
          <li key={slice.name} className="flex items-center gap-1.5 text-zinc-300">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index] }} />
            {slice.name}: {slice.units}
          </li>
        ))}
      </ul>
    </article>
  );
}
