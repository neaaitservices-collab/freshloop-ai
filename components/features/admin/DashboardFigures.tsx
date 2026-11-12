'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminDashboard } from '@/components/features/admin/AdminDashboard';
import { DashboardCard } from '@/components/features/admin/DashboardCard';
import type { DepartmentAlert, StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { subscribeInventoryUpdated } from '@/lib/domains/inventory/inventoryMoveClient';
import { subscribeKpiUpdated } from '@/lib/domains/stats/kpiEvents';
import { FRESHLOOP_SETTINGS_UPDATED } from '@/lib/domains/stats/settingsEvents';

const PERIOD_PRESETS = ['day', 'week', 'month'] as const;
type PeriodPreset = (typeof PERIOD_PRESETS)[number];

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

function readPreset(value: string | null): PeriodPreset {
  return PERIOD_PRESETS.includes(value as PeriodPreset) ? (value as PeriodPreset) : 'week';
}

export function DashboardFiguresSkeleton() {
  return (
    <div
      aria-label="Admin dashboard"
      aria-busy="true"
      className="h-80 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
    />
  );
}

function DepartmentAlertList({
  alerts,
  known,
}: {
  alerts: DepartmentAlert[];
  known: boolean;
}) {
  const rows = alerts.filter((row) => row.low > 0 || row.expiring > 0);
  return (
    <DashboardCard className="p-4" aria-label="Alerts">
      <h2 className="text-base font-black text-slate-50">Alerts</h2>
      {!known ? (
        <div className="mt-3 h-8 animate-pulse rounded-lg bg-slate-800" />
      ) : rows.length === 0 ? (
        <p className="pt-3 text-sm text-slate-400">No department alerts.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => (
            <li key={row.department}>
              <p className="text-sm font-black text-slate-50">{row.department}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {row.low > 0 ? (
                  <span className="rounded-lg bg-amber-950 px-2 py-1 text-xs font-bold text-amber-300">
                    {row.low} below par
                  </span>
                ) : null}
                {row.expiring > 0 ? (
                  <span className="rounded-lg bg-rose-950 px-2 py-1 text-xs font-bold text-rose-300">
                    {row.expiring} short-dated
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

export function DashboardFigures({
  stats: initialStats,
  initialWasteKpi = null,
  rangeError = null,
}: {
  stats: StoreStats | null;
  initialWasteKpi?: WasteKpiReport | null;
  rangeError?: string | null;
}) {
  // The server bundle is the fixed 30-day window. Chip totals come from the preset fetch.
  void initialWasteKpi;
  const params = useSearchParams();
  const preset = readPreset(params.get('preset'));
  const [inventoryValue, setInventoryValue] = useState<number | null>(
    initialStats?.inventoryValue ?? null
  );
  const [alerts, setAlerts] = useState<DepartmentAlert[]>(initialStats?.departmentAlerts ?? []);
  const [alertsKnown, setAlertsKnown] = useState(initialStats != null);
  const [period, setPeriod] = useState<{
    preset: PeriodPreset;
    stats: StoreStats;
    wasteKpi: WasteKpiReport | null;
  } | null>(null);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!initialStats) return;
    setInventoryValue(initialStats.inventoryValue);
    setAlerts(initialStats.departmentAlerts);
    setAlertsKnown(true);
  }, [initialStats]);

  const refreshStats = useCallback(async (opts?: { silent?: boolean }) => {
    const ticket = ++requestId.current;
    const activePreset = preset;
    if (!opts?.silent) setStatsRefreshing(true);
    setStatsError(null);
    try {
      const result = await fetchAdminStats(`preset=${activePreset}`);
      if (ticket !== requestId.current) return;
      if (result.error) {
        setStatsError(result.error);
        return;
      }
      if (result.stats) {
        setInventoryValue(result.stats.inventoryValue);
        setAlerts(result.stats.departmentAlerts);
        setAlertsKnown(true);
        setPeriod({
          preset: activePreset,
          stats: result.stats,
          wasteKpi: result.wasteKpi ?? null,
        });
      }
    } finally {
      if (ticket === requestId.current) setStatsRefreshing(false);
    }
  }, [preset]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

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

  const readyPeriod = period != null && period.preset === preset ? period : null;

  return (
    <section className="space-y-4" aria-label="Store KPI dashboard">
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
        stats={readyPeriod ? readyPeriod.stats : null}
        wasteKpi={readyPeriod ? readyPeriod.wasteKpi : null}
        inventoryValue={inventoryValue}
        refreshing={statsRefreshing && readyPeriod == null}
      />
      <DepartmentAlertList alerts={alerts} known={alertsKnown} />
    </section>
  );
}
