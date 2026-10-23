'use client';

import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { CORAL, EMERALD, GRID, TICK, chartCard } from '@/components/ui/chartColors';
import type { RevenueDay } from '@/lib/domains/stats/storeStatsTypes';
import { cn } from '@/lib/utils/cn';

export function RevenueRecoveryChart({ data }: { data: RevenueDay[] }) {
  return (
    <article className={cn(chartCard, 'transition hover:border-slate-700')}>
      <h2 className="text-sm font-black text-slate-100">Revenue lost &amp; recovered</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">Last 7 days · lost vs kitchen rescue.</p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: TICK, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: TICK, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(value: number) => `$${value}`}
            />
            <Tooltip content={<ChartTooltip money />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar dataKey="lost" name="Lost" fill={CORAL} radius={[6, 6, 0, 0]} animationDuration={700} />
            <Bar dataKey="recovered" name="Recovered" fill={EMERALD} radius={[6, 6, 0, 0]} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
