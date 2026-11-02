'use client';

import React from 'react';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';
import type { ExecutiveKpiSummary } from '@/lib/domains/executive/types';
import { cn } from '@/lib/utils/cn';

export function ROIImpactSummary({
  kpis,
  loading = false,
}: {
  kpis: ExecutiveKpiSummary | null;
  loading?: boolean;
}) {
  if (loading || !kpis) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>ROI impact summary</CardTitle>
          <CardDescription>Loading financial projection…</CardDescription>
        </CardHeader>
        <CardBody>
          <div className="h-24 animate-pulse rounded-xl bg-slate-800/60" />
        </CardBody>
      </Card>
    );
  }

  const rows = [
    {
      label: 'Waste & shrink avoided',
      value: kpis.wasteCostAvoidedUsd,
      hint: 'Modeled from ledger waste $ + scenario',
    },
    {
      label: 'Labor efficiency',
      value: kpis.laborSavingsUsd,
      hint: 'Hours saved × loaded rate',
    },
    {
      label: 'Rescue value (reference)',
      value: kpis.rescueValueUsd,
      hint: 'Retail $ kept in margin via kitchen rescue',
    },
  ];

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="border-slate-800/80">
        <CardTitle className="text-base">ROI impact summary</CardTitle>
        <CardDescription className="max-w-xl text-xs leading-relaxed">
          {kpis.headline}
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className="rounded-xl border border-slate-800/80 bg-slate-950/50 px-3 py-2.5"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{row.label}</p>
              <p className="mt-1 font-mono text-lg font-black text-emerald-300/95">
                {formatCurrency(row.value)}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">{row.hint}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-emerald-900/30 bg-emerald-950/20 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
              Projected annual ROI
            </p>
            <p className="font-mono text-2xl font-black text-emerald-300">
              {formatCurrency(kpis.projectedAnnualRoiUsd)}
            </p>
          </div>
          <div className="h-10 w-px bg-slate-700/80 hidden sm:block" aria-hidden />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Operational efficiency index
            </p>
            <p
              className={cn(
                'font-mono text-2xl font-black',
                kpis.operationalEfficiencyPct >= 90 ? 'text-emerald-300' : 'text-amber-200'
              )}
            >
              {kpis.operationalEfficiencyPct.toFixed(1)}%
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
