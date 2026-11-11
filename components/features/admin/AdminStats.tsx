'use client';

import React from 'react';
import { DollarSign, Leaf, Percent, TrendingDown } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';
import { RETAIL_VALUE_LOST_DETAIL } from '@/lib/domains/stats/wasteDollarLabels';
import { rescueRateLabel } from '@/lib/domains/stats/rescueCards';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  accent = 'text-slate-100',
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <Card>
      <CardBody className="py-3 sm:py-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <Icon className="h-3.5 w-3.5 shrink-0 text-blue-400/90" />
        </div>
        <p
          className={`mt-1.5 font-mono text-2xl font-black tabular-nums tracking-tight sm:text-[1.65rem] ${accent}`}
        >
          {value}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-500">{detail}</p>
      </CardBody>
    </Card>
  );
}

export function AdminMetricGrid({
  stats,
  rangeLabel,
}: {
  stats: StoreStats | null;
  rangeLabel?: string | null;
}) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-[92px] animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50 sm:h-[100px]"
          />
        ))}
      </div>
    );
  }

  const range = rangeLabel || stats.cardRangeLabel;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <Metric
        label={`Value rescued (${range})`}
        value={formatCurrency(stats.rescuedValue)}
        detail={`Retail $ sent from the floor to production (${range}).`}
        icon={DollarSign}
        accent="text-emerald-400"
      />
      <Metric
        label={`Value lost (${range})`}
        value={formatCurrency(stats.lostValue)}
        detail={RETAIL_VALUE_LOST_DETAIL}
        icon={TrendingDown}
        accent="text-slate-300"
      />
      <Metric
        label="Inventory value"
        value={formatCurrency(stats.inventoryValue)}
        detail="Now"
        icon={Leaf}
        accent="text-slate-100"
      />
      <Metric
        label="Rescue rate"
        value={rescueRateLabel(stats.wasteReductionPct)}
        detail={`Share of handled retail $ rescued versus discard (${range}).`}
        icon={Percent}
        accent="text-emerald-400"
      />
    </div>
  );
}

