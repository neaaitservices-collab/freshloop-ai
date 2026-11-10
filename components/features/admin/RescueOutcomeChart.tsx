'use client';

import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { CORAL, EMERALD, GRID, TICK } from '@/components/ui/chartColors';
import { DashboardCard } from '@/components/features/admin/DashboardCard';
import type { RescueOutcomeDay } from '@/lib/domains/stats/storeStatsTypes';
import { cn } from '@/lib/utils/cn';

type Measure = 'usd' | 'units';

function formatAxis(value: number, measure: Measure): string {
  if (measure === 'units') {
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
    return String(Math.round(value));
  }
  if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return `$${value}`;
}

function totals(days: RescueOutcomeDay[]) {
  let recoveredUsd = 0;
  let lostUsd = 0;
  let rescueUnits = 0;
  let discardUnits = 0;
  for (const day of days) {
    recoveredUsd += day.recoveredUsd;
    lostUsd += day.lostUsd;
    rescueUnits += day.rescueUnits;
    discardUnits += day.discardUnits;
  }
  const handledUsd = recoveredUsd + lostUsd;
  const rescueSharePct =
    handledUsd > 0 ? Number(((recoveredUsd / handledUsd) * 100).toFixed(1)) : null;
  return { recoveredUsd, lostUsd, rescueUnits, discardUnits, rescueSharePct };
}

export function RescueOutcomeChart({
  data,
  className,
  tall = false,
  variant = 'default',
  rangeLabel = null,
  loading = false,
}: {
  data: RescueOutcomeDay[];
  className?: string;
  tall?: boolean;
  variant?: 'default' | 'dashboard';
  /** Exact Toronto dates. Null keeps the default last-7-days window. */
  rangeLabel?: string | null;
  loading?: boolean;
}) {
  const [measure, setMeasure] = useState<Measure>('usd');

  const summary = useMemo(() => totals(data), [data]);

  const chartRows = useMemo(
    () =>
      data.map((day) => ({
        label: day.label,
        recovered: measure === 'usd' ? day.recoveredUsd : day.rescueUnits,
        lost: measure === 'usd' ? day.lostUsd : day.discardUnits,
      })),
    [data, measure]
  );

  const hasData =
    summary.recoveredUsd + summary.lostUsd + summary.rescueUnits + summary.discardUnits > 0;

  return (
    <DashboardCard className={cn('flex flex-col', className)}>
      <header className="shrink-0 space-y-2">
        <div>
          <h2 className="text-base font-black text-slate-100">Production transfers vs discard</h2>
          <p className="mt-1 text-sm text-slate-400">
            {rangeLabel ?? 'Last 7 days'} · Floor to Production transfers vs floor waste (ledger)
          </p>
          {variant === 'default' ? (
            <p className="mt-0.5 text-xs text-slate-500">
              Product moves only — volumetric scrap buckets count toward waste % above, not here.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-xl border border-slate-700 bg-slate-950/80 p-0.5"
            role="tablist"
            aria-label="Chart measure"
          >
            {(
              [
                ['usd', 'Retail $'],
                ['units', 'Units'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={measure === id}
                onClick={() => setMeasure(id)}
                className={cn(
                  'min-h-11 rounded-lg px-4 text-xs font-bold uppercase tracking-wide transition',
                  measure === id
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {summary.rescueSharePct != null ? (
            <p className="text-xs text-slate-400">
              <span className="font-mono font-bold tabular-nums text-emerald-300">
                {summary.rescueSharePct}%
              </span>{' '}
              of handled retail $ moved to production
            </p>
          ) : null}
        </div>

        {hasData ? (
          <dl
            className={cn(
              'grid grid-cols-2 gap-3',
              variant === 'dashboard' ? 'sm:max-w-md' : 'gap-2 text-[11px] sm:grid-cols-4'
            )}
          >
            <div
              className={cn(
                'rounded-xl px-3 py-3',
                variant === 'dashboard'
                  ? 'border-2 border-emerald-500/50 bg-emerald-950/20'
                  : 'border border-slate-800 bg-slate-950/60 px-2.5 py-2'
              )}
            >
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Recovered
              </dt>
              <dd
                className={cn(
                  'font-mono font-black tabular-nums text-emerald-300',
                  variant === 'dashboard' ? 'text-2xl' : 'text-sm'
                )}
              >
                {measure === 'usd'
                  ? `$${summary.recoveredUsd.toFixed(0)}`
                  : summary.rescueUnits.toFixed(0)}
              </dd>
            </div>
            <div
              className={cn(
                'rounded-xl px-3 py-3',
                variant === 'dashboard'
                  ? 'border-2 border-slate-600/80 bg-slate-950/60'
                  : 'border border-slate-800 bg-slate-950/60 px-2.5 py-2'
              )}
            >
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Lost</dt>
              <dd
                className={cn(
                  'font-mono font-black tabular-nums text-slate-200',
                  variant === 'dashboard' ? 'text-2xl' : 'text-sm text-rose-300'
                )}
              >
                {measure === 'usd' ? `$${summary.lostUsd.toFixed(0)}` : summary.discardUnits.toFixed(0)}
              </dd>
            </div>
          </dl>
        ) : null}
        {hasData && variant === 'dashboard' ? (
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span className="text-emerald-400/90">Recovered</span>
            <span className="mx-2 text-slate-600">|</span>
            <span className="text-slate-400">Lost</span>
          </p>
        ) : null}
      </header>

      {loading ? (
        <div className="mt-3 h-56 animate-pulse rounded-xl bg-slate-900/50" aria-busy="true" />
      ) : !hasData ? (
        <p className="mt-3 py-10 text-center text-sm text-slate-500">
          {rangeLabel
            ? 'No Production transfers or floor waste in this range.'
            : 'No Production transfers or floor waste logged in the last 7 days.'}
        </p>
      ) : (
        <div
          className={cn(
            'mt-3 w-full',
            tall ? 'h-52 sm:h-64 lg:h-72' : 'h-56 sm:h-64'
          )}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} barGap={6} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
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
                tickFormatter={(v) => formatAxis(Number(v), measure)}
                label={{
                  value: measure === 'usd' ? 'USD' : 'Units',
                  angle: -90,
                  position: 'insideLeft',
                  fill: TICK,
                  fontSize: 10,
                  offset: 12,
                }}
              />
              <Tooltip
                content={<ChartTooltip money={measure === 'usd'} />}
                cursor={{ fill: 'rgba(148,163,184,0.08)' }}
              />
              <Bar
                dataKey="lost"
                name="Discard"
                fill={CORAL}
                radius={[6, 6, 0, 0]}
                animationDuration={700}
              />
              <Bar
                dataKey="recovered"
                name="Production transfers"
                fill={EMERALD}
                radius={[6, 6, 0, 0]}
                animationDuration={700}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </DashboardCard>
  );
}
