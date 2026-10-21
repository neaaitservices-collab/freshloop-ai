'use client';

import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartCard, CORAL, GRID, OCEAN, TICK } from '@/components/admin/chartColors';
import { ChartTooltip } from '@/components/admin/ChartTooltip';
import type { RevenueDay } from '@/lib/storeStatsTypes';

export function RevenueRecoveryChart({ data }: { data: RevenueDay[] }) {
  return (
    <article className={chartCard}>
      <h2 className="text-sm font-black text-slate-100">Revenue lost and recovered</h2>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
        Last 7 days. Coral is discarded value. Ocean is value sent to the kitchen.
      </p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: TICK, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: TICK, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(value: number) => `$${value}`}
            />
            <Tooltip content={<ChartTooltip money />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar dataKey="lost" name="Lost" fill={CORAL} radius={[6, 6, 0, 0]} animationDuration={700} />
            <Bar dataKey="recovered" name="Recovered" fill={OCEAN} radius={[6, 6, 0, 0]} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
