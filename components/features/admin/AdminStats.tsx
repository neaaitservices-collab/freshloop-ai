'use client';

import React from 'react';
import { Clock, DollarSign, Leaf, Percent } from 'lucide-react';
import { RevenueRecoveryChart } from '@/components/features/admin/RevenueRecoveryChart';
import { WasteVsRescueChart } from '@/components/features/admin/WasteVsRescueChart';
import { Card, CardBody } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  accent = 'text-slate-100',
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <Card>
      <CardBody className="py-3 sm:py-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <Icon className="h-3.5 w-3.5 shrink-0 text-blue-400/90" />
        </div>
        <p className={`mt-1.5 font-mono text-2xl font-black tracking-tight sm:text-[1.65rem] ${accent}`}>
          {value}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">{detail}</p>
      </CardBody>
    </Card>
  );
}

export function AdminMetricGrid({ stats }: { stats: StoreStats | null }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-[92px] animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50 sm:h-[100px]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <Metric
        label="Value rescued"
        value={formatCurrency(stats.rescuedValue)}
        detail="Production rescue $ — not the same as waste % below."
        icon={DollarSign}
        accent="text-emerald-400/90"
      />
      <Metric
        label="Due within 48h"
        value={String(stats.expiringWithin48h)}
        detail="On-hand lots inside the next 48 hours."
        icon={Clock}
        accent="text-rose-400"
      />
      <Metric
        label="Inventory value"
        value={formatCurrency(stats.inventoryValue)}
        detail="On-hand units at stored unit cost."
        icon={Leaf}
        accent="text-slate-100"
      />
      <Metric
        label="Rescue rate"
        value={stats.wasteReductionPct === null ? '—' : `${stats.wasteReductionPct.toFixed(1)}%`}
        detail="Rescued ÷ (rescued + discard) by retail $."
        icon={Percent}
        accent="text-blue-300"
      />
    </div>
  );
}

/** @deprecated Prefer `DashboardFigures` two-column layout. */
export function AdminChartGrid({ stats }: { stats: StoreStats | null }) {
  if (!stats) {
    return (
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="h-80 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50 lg:col-span-5" />
        <div className="h-80 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50 lg:col-span-7" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <WasteVsRescueChart data={stats.rescueVsDiscard} />
      </div>
      <div className="lg:col-span-7">
        <RevenueRecoveryChart data={stats.revenueDays} tall />
      </div>
    </div>
  );
}

export function AdminStats({ stats }: { stats: StoreStats | null }) {
  return (
    <section className="space-y-3" aria-label="Store KPIs and charts">
      <AdminMetricGrid stats={stats} />
      <AdminChartGrid stats={stats} />
    </section>
  );
}
