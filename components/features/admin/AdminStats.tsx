'use client';

import React from 'react';
import { Clock, DollarSign, Leaf, Percent } from 'lucide-react';
import { DepartmentAlertsChart } from '@/components/features/admin/DepartmentAlertsChart';
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
      <CardBody className="py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <Icon className="h-4 w-4 text-blue-400/90" />
        </div>
        <p className={`mt-2 font-mono text-3xl font-black tracking-tight ${accent}`}>{value}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p>
      </CardBody>
    </Card>
  );
}

export function AdminStats({ stats }: { stats: StoreStats | null }) {
  if (!stats) {
    return (
      <section className="space-y-4" aria-busy="true" aria-label="Loading store statistics">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-[120px] animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50" />
          ))}
        </div>
        <div className="grid gap-3 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-72 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Value rescued"
          value={formatCurrency(stats.rescuedValue)}
          detail="Retail value moved to kitchen prep instead of waste."
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
          label="Waste reduction"
          value={stats.wasteReductionPct === null ? '—' : `${stats.wasteReductionPct.toFixed(1)}%`}
          detail="Share of handled value rescued vs discarded."
          icon={Percent}
          accent="text-blue-300"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <WasteVsRescueChart data={stats.rescueVsDiscard} />
        <RevenueRecoveryChart data={stats.revenueDays} />
        <DepartmentAlertsChart data={stats.departmentAlerts} />
      </div>
    </section>
  );
}
