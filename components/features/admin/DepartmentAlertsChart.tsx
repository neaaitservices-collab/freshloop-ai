'use client';

import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { AMBER, CORAL, GRID, TICK, chartCard } from '@/components/ui/chartColors';
import type { DepartmentAlert } from '@/lib/domains/stats/storeStatsTypes';
import { cn } from '@/lib/utils/cn';

export function DepartmentAlertsChart({ data }: { data: DepartmentAlert[] }) {
  return (
    <article className={cn(chartCard, 'transition hover:border-slate-700')}>
      <h2 className="text-sm font-black text-slate-100">Alerts by department</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">Below par and due within 48h.</p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="department" tick={{ fill: TICK, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              allowDecimals={false}
              tick={{ fill: TICK, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar dataKey="low" name="Low stock" fill={AMBER} radius={[6, 6, 0, 0]} animationDuration={700} />
            <Bar dataKey="expiring" name="Due in 48h" fill={CORAL} radius={[6, 6, 0, 0]} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
