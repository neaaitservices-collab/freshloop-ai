'use client';

import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import type { DepartmentAlert } from '@/lib/domains/stats/storeStatsTypes';

export function DepartmentAlertsChart({ data }: { data: DepartmentAlert[] }) {
  return (
    <article className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-xl shadow-black/20 backdrop-blur-sm transition hover:border-emerald-500/30 lg:col-span-2">
      <h2 className="text-sm font-black text-white">Alerts by department</h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
        Items on hand that are below their alert level, and items due within 48 hours.
      </p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <CartesianGrid stroke="#27272a" vertical={false} />
            <XAxis dataKey="department" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="low" name="Low stock" fill="#fbbf24" radius={[6, 6, 0, 0]} animationDuration={700} />
            <Bar dataKey="expiring" name="Due in 48h" fill="#fb7185" radius={[6, 6, 0, 0]} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
