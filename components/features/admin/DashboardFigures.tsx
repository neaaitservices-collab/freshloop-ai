'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { AdminStats } from '@/components/features/admin/AdminStats';
import { Card, CardBody } from '@/components/ui/Card';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import { cn } from '@/lib/utils/cn';

export function DashboardFigures({ stats }: { stats: StoreStats | null }) {
  const wastePct = stats?.wastePct ?? null;
  const targetWastePct = stats?.targetWastePct ?? 2.5;
  const wasteLabel = wastePct === null ? '—' : `${wastePct.toFixed(2)}%`;
  const healthy = wastePct === null || wastePct <= targetWastePct;

  return (
    <div className="space-y-4">
      <AdminStats stats={stats} />

      <Card
        className={cn(
          healthy
            ? 'border-emerald-800/40 bg-emerald-950/20'
            : 'border-rose-900/50 bg-rose-950/25'
        )}
      >
        <CardBody>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Waste KPI</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <p
              className={cn(
                'font-mono text-4xl font-black tracking-tight',
                healthy ? 'text-emerald-400/90' : 'text-rose-400'
              )}
            >
              {wasteLabel}
            </p>
            <p className="text-sm text-slate-300">
              Target {targetWastePct.toFixed(1)}%
              <span className="mt-1 block text-slate-500">
                {stats ? `${stats.pulls} pulls within 3 days` : 'Reading pull count…'}
              </span>
            </p>
          </div>
        </CardBody>
      </Card>

      <Link href="/orders" className="block">
        <Card className="transition hover:border-amber-800/40 hover:bg-slate-800/30">
          <CardBody className="flex items-center justify-between gap-3 py-4">
            <span>
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-amber-400/90">
                <AlertTriangle className="h-3.5 w-3.5" />
                Low stock
              </span>
              <span className="mt-1 block text-sm text-slate-300">
                {stats === null
                  ? 'Checking on-hand cases…'
                  : stats.lowCount === 0
                    ? 'Nothing is below its alert level.'
                    : `${stats.lowCount} items below par — open purchase orders.`}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-black text-blue-300">
              Orders
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </CardBody>
        </Card>
      </Link>
    </div>
  );
}
