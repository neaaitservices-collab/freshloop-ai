'use client';

import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { AMBER, EMERALD, GRID, OCEAN, TICK, chartCard } from '@/components/ui/chartColors';
import type { CostVariancePoint } from '@/lib/domains/executive/types';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';
import { cn } from '@/lib/utils/cn';

export function CostVarianceChart({
  data,
  loading = false,
  showComparison = true,
}: {
  data: CostVariancePoint[];
  loading?: boolean;
  showComparison?: boolean;
}) {
  const totalSavings = useMemo(
    () => data.reduce((sum, row) => sum + row.savings, 0),
    [data]
  );

  if (loading) {
    return (
      <article className={cn(chartCard, 'min-h-[22rem]')}>
        <div className="h-6 w-48 animate-pulse rounded bg-slate-800" />
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-slate-800/60" />
      </article>
    );
  }

  if (data.length === 0) {
    return (
      <article className={cn(chartCard, 'min-h-[22rem] flex flex-col justify-center')}>
        <h2 className="text-sm font-black text-slate-100">Cost variance · baseline vs optimized</h2>
        <p className="mt-2 text-sm text-slate-500">No variance data yet. Adjust scenario controls to preview savings.</p>
      </article>
    );
  }

  return (
    <article className={cn(chartCard, 'transition hover:border-slate-700')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-slate-100">Cost variance · baseline vs optimized</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Monthly operating cost (waste + shrink proxy). Green bar shows modeled optimized spend.
          </p>
        </div>
        <p className="rounded-xl bg-emerald-950/40 px-3 py-1.5 text-right ring-1 ring-emerald-900/40">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
            6-mo savings
          </span>
          <span className="font-mono text-sm font-black text-emerald-300">
            {formatCurrency(totalSavings)}
          </span>
        </p>
      </div>
      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={6}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: TICK, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: TICK, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<ChartTooltip money />} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
            {showComparison ? (
              <>
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  formatter={(value) => (
                    <span className="text-slate-400">{value}</span>
                  )}
                />
                <Bar
                  dataKey="baseline"
                  name="Baseline"
                  fill={AMBER}
                  radius={[6, 6, 0, 0]}
                  animationDuration={600}
                />
                <Bar
                  dataKey="optimized"
                  name="Optimized"
                  fill={EMERALD}
                  radius={[6, 6, 0, 0]}
                  animationDuration={600}
                />
              </>
            ) : (
              <Bar dataKey="savings" name="Savings" fill={OCEAN} radius={[6, 6, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
