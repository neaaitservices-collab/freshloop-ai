'use client';

import React from 'react';
import { AdminMetricGrid } from '@/components/features/admin/AdminStats';
import { StatsDateFilter } from '@/components/features/admin/StatsDateFilter';
import { LazyRescueOutcomeChart } from '@/components/charts/lazyCharts';
import { WasteSemaphoreCard } from '@/components/features/admin/WasteSemaphoreCard';
import { AdminActionCenter } from '@/components/features/admin/AdminActionCenter';
import { DashboardCard } from '@/components/features/admin/DashboardCard';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { cn } from '@/lib/utils/cn';

export function AdminDashboard({
  stats,
  wasteKpi,
  refreshing = false,
  showActionLoadingPlaceholders = false,
  className,
  rangeLabel = null,
  chartLoading = false,
}: {
  stats: StoreStats | null;
  wasteKpi: WasteKpiReport | null;
  refreshing?: boolean;
  showActionLoadingPlaceholders?: boolean;
  className?: string;
  rangeLabel?: string | null;
  chartLoading?: boolean;
}) {
  const outcomeDays = stats?.outcomeDays ?? [];

  return (
    <div
      className={cn(
        'space-y-6 rounded-3xl border border-slate-800/60 bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900/50 p-4 shadow-inner shadow-black/20 sm:p-6',
        className
      )}
      aria-label="Admin dashboard"
      aria-busy={refreshing || undefined}
    >
      <header className="border-b border-slate-800/80 pb-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400/90">
          Executive overview
        </p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
          Action center &amp; KPIs
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Pending decisions, department risk, and waste/rescue performance.
        </p>
      </header>

      <AdminActionCenter
        stats={stats}
        showLoadingPlaceholders={showActionLoadingPlaceholders}
      />

      <div className="space-y-3">
        <div className="lg:hidden">
          <StatsDateFilter />
        </div>
        <div className="hidden lg:flex lg:items-center lg:justify-end">
          <StatsDateFilter compact />
        </div>
        <AdminMetricGrid stats={stats} rangeLabel={stats?.cardRangeLabel} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-5">
          <WasteSemaphoreCard
            wasteKpi={wasteKpi}
            goalPct={stats?.targetWastePct ?? wasteKpi?.targetWastePct}
            refreshing={refreshing}
            className="min-h-[360px]"
            retailLost={stats?.lostValue ?? null}
          />
        </div>
        <div className="lg:col-span-7">
          {stats ? (
            <LazyRescueOutcomeChart
              data={outcomeDays}
              tall
              variant="dashboard"
              rangeLabel={rangeLabel ?? stats?.transferRangeLabel}
              loading={chartLoading}
            />
          ) : (
            <DashboardCard className="min-h-[360px] animate-pulse bg-slate-900/40" aria-busy />
          )}
        </div>
      </div>
    </div>
  );
}
