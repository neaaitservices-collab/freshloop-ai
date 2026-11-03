'use client';

import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { CORAL, EMERALD, GRID, TICK } from '@/components/ui/chartColors';
import type { RevenueDay } from '@/lib/domains/stats/storeStatsTypes';
import { DashboardCard } from '@/components/features/admin/DashboardCard';
import { cn } from '@/lib/utils/cn';

function formatAxisMoney(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return `$${value}`;
}

export function RevenueRecoveryChart({
  data,
  className,
  tall = false,
}: {
  data: RevenueDay[];
  className?: string;
  /** Taller chart for admin two-column layout */
  tall?: boolean;
}) {
  return (
    <DashboardCard className={cn('flex min-h-0 flex-col', tall && 'min-h-[420px] flex-1', className)}>
      <header className="shrink-0">
        <h2 className="text-base font-black text-slate-100">Revenue lost &amp; recovered</h2>
        <p className="mt-1 text-sm text-slate-400">Last 7 days · lost vs production rescue</p>
      </header>
      <div className={cn('mt-4 w-full min-h-0 flex-1', tall ? 'min-h-[320px]' : 'h-72')}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={6} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fill: TICK, fontSize: 12, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
              dy={8}
            />
            <YAxis
              tick={{ fill: TICK, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={formatAxisMoney}
              label={{
                value: 'USD',
                angle: -90,
                position: 'insideLeft',
                fill: TICK,
                fontSize: 10,
                offset: 12,
              }}
            />
            <Tooltip content={<ChartTooltip money />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar dataKey="lost" name="Lost" fill={CORAL} radius={[6, 6, 0, 0]} animationDuration={700} />
            <Bar
              dataKey="recovered"
              name="Recovered"
              fill={EMERALD}
              radius={[6, 6, 0, 0]}
              animationDuration={700}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  );
}
