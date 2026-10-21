'use client';

import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartCard, CORAL, GRID, STEEL, TICK } from '@/components/admin/chartColors';
import { ChartTooltip } from '@/components/admin/ChartTooltip';
import type { DepartmentAlert } from '@/lib/storeStatsTypes';

export function DepartmentAlertsChart({ data }: { data: DepartmentAlert[] }) {
  return (
    <article className={chartCard}>
      <h2 className="text-sm font-black text-slate-100">Alerts by department</h2>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
        Steel is below the alert level. Coral is due within 48 hours.
      </p>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="department" tick={{ fill: TICK, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: TICK, fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar dataKey="low" name="Low stock" fill={STEEL} radius={[6, 6, 0, 0]} animationDuration={700} />
            <Bar dataKey="expiring" name="Due in 48h" fill={CORAL} radius={[6, 6, 0, 0]} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
