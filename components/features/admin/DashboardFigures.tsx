'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ChevronDown } from 'lucide-react';
import { AdminStats } from '@/components/features/admin/AdminStats';
import { DepartmentAlertsChart } from '@/components/features/admin/DepartmentAlertsChart';
import { Card, CardBody } from '@/components/ui/Card';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import { cn } from '@/lib/utils/cn';

export function DashboardFigures({ stats: initialStats }: { stats: StoreStats | null }) {
  const [stats, setStats] = useState<StoreStats | null>(initialStats);
  const [alertsOpen, setAlertsOpen] = useState(false);

  useEffect(() => {
    setStats(initialStats);
  }, [initialStats]);

  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.stats) {
        setStats(json.stats as StoreStats);
      }
    } catch {
      /* keep last snapshot */
    }
  }, []);

  useEffect(() => {
    window.addEventListener('freshloop-inventory-updated', refreshStats);
    return () => window.removeEventListener('freshloop-inventory-updated', refreshStats);
  }, [refreshStats]);

  const wastePct = stats?.wastePct ?? null;
  const targetWastePct = stats?.targetWastePct ?? 2.5;
  const wasteLabel = wastePct === null ? '—' : `${wastePct.toFixed(2)}%`;
  const healthy = wastePct === null || wastePct <= targetWastePct;

  return (
    <section
      className="space-y-3"
      aria-label="Executive dashboard"
    >
      <AdminStats stats={stats} />

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Card
          className={cn(
            healthy
              ? 'border-emerald-800/40 bg-emerald-950/15'
              : 'border-rose-900/50 bg-rose-950/20'
          )}
        >
          <CardBody className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Waste KPI</p>
              <p
                className={cn(
                  'font-mono text-2xl font-black',
                  healthy ? 'text-emerald-400/90' : 'text-rose-400'
                )}
              >
                {wasteLabel}
              </p>
              <p className="text-[11px] text-slate-500">
                Target {targetWastePct.toFixed(1)}%
                {stats ? ` · ${stats.pulls} pulls (3d window)` : ''}
              </p>
            </div>
          </CardBody>
        </Card>

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
