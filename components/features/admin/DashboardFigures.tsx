'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AdminDashboard } from '@/components/features/admin/AdminDashboard';
import { DashboardCard } from '@/components/features/admin/DashboardCard';
import { orderAlertHint, orderAlertHref } from '@/lib/domains/orders/orderAlertLink';
import type { DepartmentAlert, StoreStats } from '@/lib/domains/stats/storeStatsTypes';
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
        <ul className="mt-3 space-y-4">
          {rows.map((row) => (
            <li key={row.code ?? row.department} className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-slate-50">{row.department}</h3>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {row.low > 0 ? (
                    <Link
                      href={orderAlertHref({ code: row.code, department: row.department, alert: 'below-par' })}
                      prefetch={false}
                      className="inline-flex min-h-11 items-center rounded-lg bg-amber-950 px-2 py-1 text-xs font-bold text-amber-300"
                    >
                      {row.low} below par ›
                    </Link>
                  ) : null}
                  {row.expiring > 0 ? (
                    <Link
                      href={orderAlertHref({
                        code: row.code,
                        department: row.department,
                        alert: 'short-dated',
                      })}
                      prefetch={false}
                      className="inline-flex min-h-11 items-center rounded-lg bg-rose-950 px-2 py-1 text-xs font-bold text-rose-300"
                    >
                      {row.expiring} short-dated ›
                    </Link>
                  ) : null}
                </div>
                <p className="mt-2 text-xs font-semibold leading-snug text-slate-500">
                  {orderAlertHint(row.low, row.expiring)}
                </p>
              </div>
              <Link
                href={orderAlertHref({ code: row.code, department: row.department, alert: 'flagged' })}
                prefetch={false}
                className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-emerald-400 px-2.5 text-xs font-extrabold text-slate-950"
              >
                Order ›
              </Link>
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
  // Chip totals load inside the scorecard. This refresh is live inventory and alerts only.
  void initialWasteKpi;
  const [inventoryValue, setInventoryValue] = useState<number | null>(
    initialStats?.inventoryValue ?? null
  );
  const [alerts, setAlerts] = useState<DepartmentAlert[]>(initialStats?.departmentAlerts ?? []);
  const [alertsKnown, setAlertsKnown] = useState(initialStats != null);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!initialStats) return;
    setInventoryValue(initialStats.inventoryValue);
    setAlerts(initialStats.departmentAlerts);
    setAlertsKnown(true);
  }, [initialStats]);

  const refreshLive = useCallback(async () => {
    const ticket = ++requestId.current;
    setStatsRefreshing(true);
    setStatsError(null);
    try {
      const result = await fetchAdminStats('');
      if (ticket !== requestId.current) return;
      if (result.error) {
        setStatsError(result.error);
        return;
      }
      if (result.stats) {
        setInventoryValue(result.stats.inventoryValue);
        setAlerts(result.stats.departmentAlerts);
        setAlertsKnown(true);
      }
    } finally {
      if (ticket === requestId.current) setStatsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (initialStats) return;
    void refreshLive();
  }, [initialStats, refreshLive]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refreshLive();
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
  }, [refreshLive]);

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
        stats={initialStats}
        wasteKpi={null}
        inventoryValue={inventoryValue}
        refreshing={statsRefreshing}
      />
      <DepartmentAlertList alerts={alerts} known={alertsKnown} />
    </section>
  );
}
