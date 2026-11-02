'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ChevronDown } from 'lucide-react';
import { AdminChartGrid, AdminMetricGrid } from '@/components/features/admin/AdminStats';
import { DepartmentAlertsChart } from '@/components/features/admin/DepartmentAlertsChart';
import { Card, CardBody } from '@/components/ui/Card';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import { WasteSemaphoreCard } from '@/components/features/admin/WasteSemaphoreCard';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { cn } from '@/lib/utils/cn';
import {
  FRESHLOOP_SETTINGS_UPDATED,
} from '@/lib/domains/stats/settingsEvents';

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
      const res = await fetch('/api/admin/stats', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setStatsError(json.error || 'Could not refresh dashboard stats.');
        return;
      }
      if (json.stats) {
        setStats(json.stats as StoreStats);
      }
      if (json.wasteKpi) {
        setWasteKpi(json.wasteKpi as WasteKpiReport);
      }
    } catch {
      setStatsError('Network error — showing last loaded stats.');
    } finally {
      if (!opts?.silent) setStatsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (initialStats && initialWasteKpi) return;
    void refreshStats({ silent: true });
  }, [refreshStats, initialStats, initialWasteKpi]);

  useEffect(() => {
    const onInventory = () => void refreshStats();
    const onSettings = () => {
      void refreshStats();
    };
    window.addEventListener('freshloop-inventory-updated', onInventory);
    window.addEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
    return () => {
      window.removeEventListener('freshloop-inventory-updated', onInventory);
      window.removeEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
    };
  }, [refreshStats]);

  return (
    <section className="space-y-2.5" aria-label="Store KPI dashboard">
      {statsError ? (
        <p className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
          {statsError}
        </p>
      ) : null}

      <AdminMetricGrid stats={stats} />

      <WasteSemaphoreCard
        wasteKpi={wasteKpi}
        goalPct={stats?.targetWastePct}
        refreshing={statsRefreshing}
      />

      <AdminChartGrid stats={stats} />

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Link href="/operations" className="block h-full">
          <Card className="h-full transition hover:border-emerald-800/40 hover:bg-slate-800/30">
            <CardBody className="flex h-full items-center justify-between gap-3 py-3">
              <span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">
                  Pull window (floor)
                </span>
                <span className="mt-0.5 block text-xs text-slate-300">
                  {stats === null
                    ? 'Loading…'
                    : `${stats.pulls} SKUs within ${stats.pullSensitivityDays}d — rescue on Operations.`}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-emerald-300">
                Operations
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </CardBody>
          </Card>
        </Link>

        <Link href="/orders" className="block h-full">
          <Card className="h-full transition hover:border-amber-800/40 hover:bg-slate-800/30">
            <CardBody className="flex h-full items-center justify-between gap-3 py-3">
              <span>
                <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-amber-400/90">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Low stock
                </span>
                <span className="mt-0.5 block text-xs text-slate-300">
                  {stats === null
                    ? 'Checking on-hand…'
                    : stats.lowCount === 0
                      ? 'All items at or above par.'
                      : `${stats.lowCount} below par — open orders.`}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-blue-300">
                Orders
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </CardBody>
          </Card>
        </Link>
      </div>

      {stats ? (
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => setAlertsOpen((open) => !open)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-bold text-slate-200 hover:bg-slate-800/40"
          >
            Alerts by department
            <ChevronDown
              className={cn('h-4 w-4 text-slate-400 transition', alertsOpen && 'rotate-180')}
            />
          </button>
          {alertsOpen ? (
            <div className="border-t border-slate-800/80 p-3 pt-0">
              <DepartmentAlertsChart data={stats.departmentAlerts} compact />
            </div>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}
