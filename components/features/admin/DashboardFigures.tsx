'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { AdminStats } from '@/components/features/admin/AdminStats';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';

export function DashboardFigures({ stats }: { stats: StoreStats | null }) {
  const wastePct = stats?.wastePct ?? null;
  const targetWastePct = stats?.targetWastePct ?? 2.5;
  const wasteLabel = wastePct === null ? '—' : `${wastePct.toFixed(2)}%`;
  const healthy = wastePct === null || wastePct <= targetWastePct;

  return (
    <>
      <AdminStats stats={stats} />
      <section
        className={`mt-5 rounded-3xl border p-5 ${
          healthy ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-rose-500/40 bg-rose-500/10'
        }`}
      >
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">Waste right now</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <p className={`font-mono text-4xl font-black ${healthy ? 'text-emerald-300' : 'text-rose-300'}`}>
            {wasteLabel}
          </p>
          <p className="text-sm text-zinc-300">
            Target {targetWastePct.toFixed(1)}%
            <span className="mt-1 block text-zinc-400">
              {stats ? `${stats.pulls} to pull within 3 days` : 'Reading the pull count…'}
            </span>
          </p>
        </div>
      </section>

      <Link
        href="/orders"
        className="mt-3 flex items-center justify-between gap-3 rounded-3xl border border-amber-500/30 bg-zinc-900 px-5 py-4 transition hover:-translate-y-0.5 hover:border-amber-300/60"
      >
        <span>
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            Low stock
          </span>
          <span className="mt-1 block text-sm text-zinc-300">
            {stats === null
              ? 'Checking on-hand cases…'
              : stats.lowCount === 0
                ? 'Nothing is below its alert level.'
                : `${stats.lowCount} items are below their alert level. Print the supplier order.`}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-black text-amber-200">
          Orders
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Link>
    </>
  );
}
