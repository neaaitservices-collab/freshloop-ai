'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import { cn } from '@/lib/utils/cn';

export function WasteRateCard({
  stats,
  refreshing = false,
}: {
  stats: StoreStats | null;
  refreshing?: boolean;
}) {
  const wastePct = stats?.wastePct ?? null;
  const targetWastePct = stats?.targetWastePct ?? 2.5;
  const pullDays = stats?.pullSensitivityDays ?? 3;
  const healthy = wastePct === null || wastePct <= targetWastePct;

  const wasteLabel =
    refreshing && stats
      ? null
      : wastePct === null
        ? '—'
        : `${wastePct.toFixed(2)}%`;

  const formulaLine =
    stats && stats.grossSalesRevenue > 0
      ? `${formatCurrency(stats.totalWasteValue)} waste ÷ ${formatCurrency(stats.grossSalesRevenue)} sales`
      : stats && stats.totalWasteValue > 0
        ? `${formatCurrency(stats.totalWasteValue)} waste · log POS sales to compute %`
        : 'No waste logged in ledger yet';

  return (
    <Card
      className={cn(
        healthy
          ? 'border-emerald-800/40 bg-emerald-950/15'
          : 'border-rose-900/50 bg-rose-950/20'
      )}
    >
      <CardBody className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Waste rate (live ledger)
          </p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
            <p
              key={wastePct ?? 'empty'}
              className={cn(
                'font-mono text-2xl font-black tabular-nums transition-opacity duration-300',
                refreshing ? 'opacity-40' : 'opacity-100',
                healthy ? 'text-emerald-400/90' : 'text-rose-400'
              )}
            >
              {refreshing ? (
                <span className="inline-flex items-center gap-2 text-lg">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  Updating…
                </span>
              ) : (
                wasteLabel
              )}
            </p>
            {!refreshing && wastePct !== null ? (
              <span className="text-xs font-bold text-slate-500">
                / goal ≤ {targetWastePct.toFixed(1)}%
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] font-mono leading-snug text-slate-400">{formulaLine}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {stats ? `${stats.pulls} pulls (${pullDays}d window)` : 'Loading pulls…'}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
