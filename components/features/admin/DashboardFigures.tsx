'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AdminMetricGrid } from '@/components/features/admin/AdminStats';
import { AdminOperationalAlertCards } from '@/components/features/admin/AdminOperationalAlertCards';
import { DepartmentAlertsChart } from '@/components/features/admin/DepartmentAlertsChart';
import { RevenueRecoveryChart } from '@/components/features/admin/RevenueRecoveryChart';
import { WasteVsRescueChart } from '@/components/features/admin/WasteVsRescueChart';
import { DashboardCard } from '@/components/features/admin/DashboardCard';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import { WasteSemaphoreCard } from '@/components/features/admin/WasteSemaphoreCard';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { cn } from '@/lib/utils/cn';
import { subscribeInventoryUpdated } from '@/lib/domains/inventory/inventoryMoveClient';
import { subscribeKpiUpdated } from '@/lib/domains/stats/kpiEvents';
import { FRESHLOOP_SETTINGS_UPDATED } from '@/lib/domains/stats/settingsEvents';

let inflightAdminStatsPromise: Promise<{
  stats?: StoreStats;
  wasteKpi?: WasteKpiReport;
  error?: string;
}> | null = null;

async function fetchAdminStatsCoalesced(): Promise<{
  stats?: StoreStats;
  wasteKpi?: WasteKpiReport;
  error?: string;
}> {
  if (inflightAdminStatsPromise) return inflightAdminStatsPromise;
  inflightAdminStatsPromise = fetch('/api/admin/stats', { cache: 'no-store' })
    .then(async (res) => {
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { error: json.error || 'Could not refresh dashboard stats.' };
      }
      return {
        stats: json.stats as StoreStats | undefined,
        wasteKpi: json.wasteKpi as WasteKpiReport | undefined,
      };
    })
    .catch(() => ({ error: 'Network error — showing last loaded stats.' }))
    .finally(() => {
      inflightAdminStatsPromise = null;
    });
  return inflightAdminStatsPromise;
}

export function DashboardFiguresSkeleton() {
  return (
    <section className="space-y-6" aria-label="Store KPI dashboard loading" aria-busy="true">
      <AdminMetricGrid stats={null} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
        <div className="flex flex-col gap-6 lg:col-span-5">
          <DashboardCard className="min-h-[340px] animate-pulse bg-slate-900/40" aria-busy />
          <DashboardCard className="min-h-[360px] animate-pulse bg-slate-900/40" aria-busy />
        </div>
        <div className="flex flex-col gap-6 lg:col-span-7">
          <DashboardCard className="min-h-[520px] animate-pulse bg-slate-900/40" aria-busy />
          <DashboardCard className="min-h-[140px] animate-pulse bg-slate-900/40" aria-busy />
        </div>
      </div>
    </section>
  );
}

export function DashboardFigures({
  stats: initialStats,
  initialWasteKpi = null,
}: {
  stats: StoreStats | null;
  initialWasteKpi?: WasteKpiReport | null;
}) {
  const [stats, setStats] = useState<StoreStats | null>(initialStats);
  const [wasteKpi, setWasteKpi] = useState<WasteKpiReport | null>(initialWasteKpi);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);

  useEffect(() => {
    setStats(initialStats);
  }, [initialStats]);

  useEffect(() => {
    setWasteKpi(initialWasteKpi);
  }, [initialWasteKpi]);

  const refreshStats = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setStatsRefreshing(true);
    setStatsError(null);
    try {
      const result = await fetchAdminStatsCoalesced();
      if (result.error) {
        setStatsError(result.error);
        return;
      }
      if (result.stats) {
        setStats(result.stats);
      }
      if (result.wasteKpi) {
        setWasteKpi(result.wasteKpi);
      }
    } finally {
      if (!opts?.silent) setStatsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (initialStats && initialWasteKpi) return;
    void refreshStats({ silent: true });
  }, [refreshStats, initialStats, initialWasteKpi]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refreshStats({ silent: true });
      }, 350);
    };

    const unsubInventory = subscribeInventoryUpdated(scheduleRefresh);
    const unsubKpi = subscribeKpiUpdated(scheduleRefresh);
    window.addEventListener(FRESHLOOP_SETTINGS_UPDATED, scheduleRefresh);

    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubInventory();
      unsubKpi();
      window.removeEventListener(FRESHLOOP_SETTINGS_UPDATED, scheduleRefresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshStats]);

  return (
    <section className="space-y-6" aria-label="Store KPI dashboard">
      {statsError ? (
        <p className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          {statsError}
        </p>
      ) : null}

      <AdminMetricGrid stats={stats} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
        {/* Left: waste KPI + unit breakdown */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          <WasteSemaphoreCard
            wasteKpi={wasteKpi}
            goalPct={stats?.targetWastePct}
            refreshing={statsRefreshing}
          />
          {stats ? (
            <WasteVsRescueChart data={stats.rescueVsDiscard} />
          ) : (
            <DashboardCard className="min-h-[360px] animate-pulse bg-slate-900/40" aria-busy />
          )}
        </div>

        {/* Right: revenue trend + operational alerts */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          {stats ? (
            <RevenueRecoveryChart data={stats.revenueDays} tall className="lg:min-h-[520px]" />
          ) : (
            <DashboardCard className="min-h-[520px] animate-pulse bg-slate-900/40" aria-busy />
          )}
          <AdminOperationalAlertCards stats={stats} />
        </div>
      </div>

      {stats ? (
        <DashboardCard className="overflow-hidden p-0">
          <button
            type="button"
            onClick={() => setAlertsOpen((open) => !open)}
            className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-bold text-slate-200 hover:bg-slate-800/40"
          >
            Alerts by department
            <ChevronDown
              className={cn('h-4 w-4 text-slate-400 transition', alertsOpen && 'rotate-180')}
            />
          </button>
          {alertsOpen ? (
            <div className="border-t border-slate-800/80 px-6 pb-6 pt-2">
              <DepartmentAlertsChart data={stats.departmentAlerts} compact />
            </div>
          ) : null}
        </DashboardCard>
      ) : null}
    </section>
  );
}
