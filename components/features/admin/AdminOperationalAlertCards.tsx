'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, PackageSearch } from 'lucide-react';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import { DashboardCard } from '@/components/features/admin/DashboardCard';
import { cn } from '@/lib/utils/cn';

export function AdminOperationalAlertCards({ stats }: { stats: StoreStats | null }) {
  const pullCount = stats?.pulls ?? 0;
  const lowCount = stats?.lowCount ?? 0;
  const storePullDays = stats?.pullSensitivityDays ?? 3;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link href="/operations" className="group block h-full">
        <DashboardCard
          className={cn(
            'h-full border-emerald-900/40 bg-gradient-to-br from-slate-900/80 to-emerald-950/20',
            'transition hover:border-emerald-700/50 hover:shadow-emerald-950/25'
          )}
        >
          <div className="flex h-full flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-400">
                <PackageSearch className="h-6 w-6" aria-hidden />
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300 opacity-90 group-hover:opacity-100">
                Operations
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">
                Pull window (floor)
              </p>
              <p className="mt-2 text-sm leading-snug text-slate-200">
                {stats === null ? (
                  'Loading pull window…'
                ) : pullCount > 0 ? (
                  <>
                    <strong className="font-mono text-lg text-white">{pullCount}</strong> SKUs need
                    action — rescue items on Operations.
                  </>
                ) : (
                  <>
                    <strong className="font-mono text-lg text-white">0</strong> SKUs in their pull
                    window — nothing due right now (default ≤{storePullDays}d).
                  </>
                )}
              </p>
            </div>
          </div>
        </DashboardCard>
      </Link>

      <Link href="/orders" className="group block h-full">
        <DashboardCard
          className={cn(
            'h-full border-amber-900/40 bg-gradient-to-br from-slate-900/80 to-amber-950/15',
            'transition hover:border-amber-700/45 hover:shadow-amber-950/20'
          )}
        >
          <div className="flex h-full flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-2.5 text-amber-400">
                <AlertTriangle className="h-6 w-6" aria-hidden />
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-300 opacity-90 group-hover:opacity-100">
                Orders
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90">
                Low stock
              </p>
              <p className="mt-2 text-sm leading-snug text-slate-200">
                {stats === null ? (
                  'Checking on-hand levels…'
                ) : lowCount > 0 ? (
                  <>
                    <strong className="font-mono text-lg text-white">{lowCount}</strong> SKUs low
                    stock — review open purchase orders.
                  </>
                ) : (
                  <>All tracked SKUs at or above par.</>
                )}
              </p>
            </div>
          </div>
        </DashboardCard>
      </Link>
    </div>
  );
}
