'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ClipboardList } from 'lucide-react';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import { DashboardCard } from '@/components/features/admin/DashboardCard';
import { cn } from '@/lib/utils/cn';

function ReviewButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/80 px-4 text-xs font-black uppercase tracking-wide text-slate-100 transition hover:border-emerald-500/40 hover:bg-emerald-950/30 hover:text-emerald-100"
    >
      Review now
    </Link>
  );
}

export function AdminActionCenter({
  stats,
  showLoadingPlaceholders = false,
}: {
  stats: StoreStats | null;
  /** When false, avoid “Loading…” flicker while silent KPI refresh runs. */
  showLoadingPlaceholders?: boolean;
}) {
  const pending = stats?.pendingApprovalsCount ?? 0;
  const lowCount = stats?.lowCount ?? 0;
  const awaitingStats = stats === null && showLoadingPlaceholders;

  return (
    <DashboardCard className="border-slate-800/90 bg-gradient-to-br from-slate-900/90 via-slate-950/80 to-slate-900/70">
      <h2 className="text-lg font-black tracking-tight text-slate-100">Operational control deck</h2>
      <p className="mt-1 text-sm text-slate-400">
        Decisions for today and critical stock alerts
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div
          className={cn(
            'flex min-h-[120px] flex-col justify-between gap-4 rounded-2xl border border-slate-800/90 bg-slate-950/50 p-4 sm:flex-row sm:items-center'
          )}
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-2.5 text-blue-300">
              <ClipboardList className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Pending tasks
              </p>
              <p className="mt-1 text-sm leading-snug text-slate-200">
                {awaitingStats ? (
                  'Loading…'
                ) : pending > 0 ? (
                  <>
                    <span className="font-mono text-lg font-black tabular-nums text-white">
                      {pending}
                    </span>{' '}
                    invoice approval{pending === 1 ? '' : 's'} needed
                  </>
                ) : (
                  <>No vendor credits or invoice flags waiting.</>
                )}
              </p>
            </div>
          </div>
          <ReviewButton href="/receive" />
        </div>

        <div
          className={cn(
            'flex min-h-[120px] flex-col justify-between gap-4 rounded-2xl border border-amber-900/35 bg-amber-950/10 p-4 sm:flex-row sm:items-center'
          )}
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-2.5 text-amber-300">
              <AlertTriangle className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90">
                Critical alerts
              </p>
              <p className="mt-1 text-sm leading-snug text-slate-200">
                {awaitingStats ? (
                  'Loading…'
                ) : lowCount > 0 ? (
                  <>
                    <span className="font-mono text-lg font-black tabular-nums text-white">
                      {lowCount}
                    </span>{' '}
                    SKUs low stock
                  </>
                ) : (
                  <>All tracked SKUs at or above par.</>
                )}
              </p>
            </div>
          </div>
          <ReviewButton href="/orders" />
        </div>
      </div>
    </DashboardCard>
  );
}
