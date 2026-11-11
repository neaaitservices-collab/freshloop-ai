'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AdminDashboard } from '@/components/features/admin/AdminDashboard';
import { LazyDepartmentAlertsChart } from '@/components/charts/lazyCharts';
import { DashboardCard } from '@/components/features/admin/DashboardCard';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { subscribeInventoryUpdated } from '@/lib/domains/inventory/inventoryMoveClient';
import { subscribeKpiUpdated } from '@/lib/domains/stats/kpiEvents';
import { FRESHLOOP_SETTINGS_UPDATED } from '@/lib/domains/stats/settingsEvents';
const inflightAdminStats = new Map<
  string,
  Promise<{
    stats?: StoreStats;
    wasteKpi?: WasteKpiReport;
    error?: string;
  }>
>();

function fetchAdminStats(query: string): Promise<{
  stats?: StoreStats;
  wasteKpi?: WasteKpiReport;
  error?: string;
}> {
  const existing = inflightAdminStats.get(query);
  if (existing) return existing;
  const url = query ? `/api/admin/stats?${query}` : '/api/admin/stats';
  const promise = fetch(url, { cache: 'no-store' })
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
      inflightAdminStats.delete(query);
    });
  inflightAdminStats.set(query, promise);
  return promise;
}

export function DashboardFiguresSkeleton() {
  return (
    <AdminDashboard stats={null} wasteKpi={null} refreshing className="animate-pulse" />
  );
}

export function DashboardFigures({
  stats: initialStats,
  initialWasteKpi = null,
  statsQuery = '',
  rangeError = null,
}: {
  stats: StoreStats | null;
  initialWasteKpi?: WasteKpiReport | null;
  statsQuery?: string;
  rangeError?: string | null;
}) {
  const expectsServerStats = initialStats !== null;
  const [stats, setStats] = useState<StoreStats | null>(initialStats);
  const [wasteKpi, setWasteKpi] = useState<WasteKpiReport | null>(initialWasteKpi);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

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
      const result = await fetchAdminStats(statsQuery);
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
  }, [statsQuery]);

  useEffect(() => {
    if (initialStats !== null) return;
    void refreshStats({ silent: true });
  }, [refreshStats, initialStats]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refreshStats({ silent: true });
      }, 350);
    };

    const unsubInventory = subscribeInventoryUpdated((detail) => {
      if (detail?.skipStatsRefresh) return;
      scheduleRefresh();
    });
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
      {rangeError ? (
        <p className="rounded-xl border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
          {rangeError}
        </p>
      ) : null}
      {statsError ? (
        <p className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          {statsError}
        </p>
      ) : null}

      <AdminDashboard
        stats={stats}
        wasteKpi={wasteKpi}
        refreshing={statsRefreshing}
        showActionLoadingPlaceholders={!expectsServerStats && stats === null}
        rangeLabel={stats?.transferRangeLabel}
        chartLoading={statsRefreshing}
      />

      {stats ? (
        <DashboardCard className="p-4 sm:p-6">
          <h2 className="text-sm font-black text-slate-100">Alerts by department</h2>
          <p className="mt-1 text-xs text-slate-400">SKUs below par and short-dated by department.</p>
          <div className="mt-4">
            <LazyDepartmentAlertsChart data={stats.departmentAlerts} compact />
          </div>
        </DashboardCard>
      ) : null}
    </section>
  );
}
