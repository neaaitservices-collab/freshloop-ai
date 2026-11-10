'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';
import {
  COST_WASTE_TOTAL_DETAIL,
  COST_WASTE_TOTAL_LABEL,
} from '@/lib/domains/stats/wasteDollarLabels';
import {
  computeScrapBucketEconomics,
  scrapBucketInputsFromSettings,
  type ScrapBucketInputs,
} from '@/lib/domains/stats/scrapBucketEconomics';
import type { PlatformSettings } from '@/lib/domains/stats/platformSettings';

export function WasteFormulaBreakdown({
  discard,
  scrap,
  sales,
  bucketCount = 0,
  scrapInputs,
  layout = 'inline',
  retailLost = null,
}: {
  discard: number;
  scrap: number;
  sales: number;
  bucketCount?: number;
  /** When set, show how scrap $ derives from bucket defaults */
  scrapInputs?:
    | ScrapBucketInputs
    | Pick<
        PlatformSettings,
        'scrapBucketVolumeL' | 'estimatedWeightPerLiterKg' | 'defaultScrapCostPerKg'
      >
    | null;
  /** Stacked rows avoid cramped wrapping in narrow dashboard columns. */
  layout?: 'inline' | 'stacked';
  /** Shelf-price value lost, shown so it is not read as this cost total. */
  retailLost?: number | null;
}) {
  const inputs =
    scrapInputs && 'volumeL' in scrapInputs
      ? scrapInputs
      : scrapInputs
        ? scrapBucketInputsFromSettings(scrapInputs)
        : null;

  const econ = inputs ? computeScrapBucketEconomics(inputs) : null;
  const totalWaste = discard + scrap;
  const showScrapSteps = econ && bucketCount > 0 && scrap > 0;

  if (layout !== 'stacked') {
    return (
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs sm:text-sm">
        <span className="text-slate-500">(</span>
        <FormulaChip label="discard" value={formatCurrency(discard)} />
        <span className="text-slate-600">+</span>
        <FormulaChip label="scrap" value={formatCurrency(scrap)} accent="text-amber-200/90" />
        <span className="text-slate-500">)</span>
        <span className="text-slate-600">÷</span>
        <FormulaChip
          label="POS sales"
          value={formatCurrency(sales)}
          accent="text-emerald-200/90"
        />
        <span className="text-slate-500">= waste %</span>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 text-xs">
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3.5">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {COST_WASTE_TOTAL_LABEL}
          </span>
          <span className="font-mono text-sm font-black tabular-nums text-white">
            {formatCurrency(totalWaste)}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          {COST_WASTE_TOTAL_DETAIL}
          {retailLost != null && Number.isFinite(retailLost)
            ? ` Value lost (30d) is ${formatCurrency(retailLost)} at shelf price.`
            : ''}
        </p>

        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-slate-800/70 bg-slate-900/50 px-2.5 py-2">
            <p className="text-[10px] font-medium text-slate-400">Item Discard</p>
            <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-slate-100">
              {formatCurrency(discard)}
            </p>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-950/15 px-2.5 py-2">
            <p className="text-[10px] font-medium text-amber-300/80">Production Scrap</p>
            <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-amber-200">
              {formatCurrency(scrap)}
            </p>
          </div>

          <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/15 px-2.5 py-2">
            <p className="text-[10px] font-medium text-emerald-300/80">POS Sales</p>
            <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-emerald-200">
              {formatCurrency(sales)}
            </p>
          </div>
        </div>
      </div>

      {showScrapSteps ? (
        <details className="group rounded-xl border border-slate-800/80 bg-slate-950/40 px-3.5 py-2.5 text-slate-400">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-slate-300 marker:content-none [&::-webkit-details-marker]:hidden">
            <span>
              <span className="font-mono font-bold text-amber-200">
                {Number.isInteger(bucketCount) ? bucketCount : bucketCount.toFixed(1)}
              </span>{' '}
              scrap {bucketCount === 1 ? 'bucket' : 'buckets'} ·{' '}
              <span className="font-mono text-slate-200">
                {formatCurrency(econ.dollarsPerBucket)}
              </span>
              /bucket
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 group-hover:text-slate-300">
              How it&apos;s calculated
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </span>
          </summary>

          <div className="mt-2.5 space-y-1.5 border-t border-slate-800/80 pt-2.5 font-mono text-[11px] text-slate-400">
            <div className="flex items-center justify-between">
              <span className="font-sans text-slate-500">Weight per bucket</span>
              <span className="text-slate-200">
                {econ.inputs.volumeL} L × {econ.inputs.densityKgPerL} kg/L = {econ.kgPerBucket} kg
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-sans text-slate-500">Cost per bucket</span>
              <span className="text-amber-200">
                {econ.kgPerBucket} kg × ${econ.inputs.costPerKg.toFixed(2)}/kg ={' '}
                {formatCurrency(econ.dollarsPerBucket)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-800/60 pt-1.5">
              <span className="font-sans font-semibold text-slate-300">Total scrap impact</span>
              <span className="font-bold text-amber-200">
                {bucketCount.toFixed(1)} × {formatCurrency(econ.dollarsPerBucket)} ={' '}
                {formatCurrency(scrap)}
              </span>
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function FormulaChip({
  label,
  value,
  accent = 'text-slate-200',
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <span className={`rounded-lg bg-slate-950 px-2 py-0.5 ${accent}`}>
      {value}
      <span className="ml-1 text-[10px] font-sans text-slate-500">{label}</span>
    </span>
  );
}

export function ScrapBucketFormulaSummary({
  inputs,
  bucketCount = 1,
}: {
  inputs: ScrapBucketInputs;
  bucketCount?: number;
}) {
  const econ = computeScrapBucketEconomics(inputs);
  const count = bucketCount > 0 ? bucketCount : 1;
  const total = econ.dollarsPerBucket * count;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2.5 text-xs text-slate-400">
      <ol className="list-decimal space-y-1 pl-4 font-mono text-[11px] leading-snug">
        <li>
          {inputs.volumeL} L × {inputs.densityKgPerL} kg/L ={' '}
          <span className="text-slate-200">{econ.kgPerBucket} kg</span> per bucket
        </li>
        <li>
          {econ.kgPerBucket} kg × ${inputs.costPerKg.toFixed(2)}/kg ={' '}
          <span className="text-amber-200">{formatCurrency(econ.dollarsPerBucket)}</span>
        </li>
        {bucketCount > 0 ? (
          <li>
            {bucketCount.toFixed(1)} bucket(s) →{' '}
            <span className="text-amber-200">{formatCurrency(total)}</span> on waste KPI
          </li>
        ) : null}
      </ol>
    </div>
  );
}
