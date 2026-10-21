'use client';

import React, { useEffect, useState } from 'react';
import { Clock, DollarSign, Leaf, Percent } from 'lucide-react';
import { DepartmentAlertsChart } from '@/components/admin/DepartmentAlertsChart';
import { RevenueRecoveryChart } from '@/components/admin/RevenueRecoveryChart';
import { WasteVsRescueChart } from '@/components/admin/WasteVsRescueChart';
import { formatCurrency } from '@/lib/yieldPricing';
import type { StoreStats } from '@/lib/storeStatsTypes';

function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <article className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-xl shadow-black/20 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-emerald-500/40">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{label}</p>
        <Icon className="h-4 w-4 text-emerald-300" />
      </div>
      <p className="mt-2 font-mono text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{detail}</p>
    </article>
  );
}

export function AdminStats() {
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/admin/stats', { cache: 'no-store' });
        const json = await response.json();
        if (cancelled) return;
        if (!response.ok || !json.success) {
          setError(json.error || 'Statistics could not be read.');
          return;
        }
        setStats(json.stats);
      } catch {
        if (!cancelled) setError('Statistics could not be read.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="mt-5 rounded-2xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
        {error}
      </p>
    );
  }

  if (!stats) {
    return <p className="mt-5 text-sm text-zinc-400">Reading store statistics…</p>;
  }

  return (
    <section className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Value rescued"
          value={formatCurrency(stats.rescuedValue)}
          detail="Retail value moved into the kitchen instead of the waste bin."
          icon={DollarSign}
        />
        <Metric
          label="Due within 48 hours"
          value={String(stats.expiringWithin48h)}
          detail="Items still on hand whose lot date is inside the next 48 hours."
          icon={Clock}
        />
        <Metric
          label="Inventory value"
          value={formatCurrency(stats.inventoryValue)}
          detail="On-hand units priced at their stored unit cost."
          icon={Leaf}
        />
        <Metric
          label="Waste reduction"
          value={stats.wasteReductionPct === null ? '—' : `${stats.wasteReductionPct.toFixed(1)}%`}
          detail="Share of handled value that was rescued rather than discarded."
          icon={Percent}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <WasteVsRescueChart data={stats.rescueVsDiscard} />
        <RevenueRecoveryChart data={stats.revenueDays} />
        <DepartmentAlertsChart data={stats.departmentAlerts} />
      </div>
    </section>
  );
}
