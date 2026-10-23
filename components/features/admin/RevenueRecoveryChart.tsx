'use client';

import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import type { RevenueDay } from '@/lib/domains/stats/storeStatsTypes';

export function RevenueRecoveryChart({ data }: { data: RevenueDay[] }) {
  return (
    <article className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-xl shadow-black/20 backdrop-blur-sm transition hover:border-emerald-500/30">
      <h2 className="text-sm font-black text-white">Revenue lost and recovered</h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
        Last 7 days. Lost is discarded retail value. Recovered is retail value sent to the kitchen.
      </p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <CartesianGrid stroke="#27272a" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: '#a1a1aa', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(value: number) => `$${value}`}
            />
            <Tooltip content={<ChartTooltip money />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="lost" name="Lost" fill="#fb7185" radius={[6, 6, 0, 0]} animationDuration={700} />
            <Bar dataKey="recovered" name="Recovered" fill="#34d399" radius={[6, 6, 0, 0]} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
