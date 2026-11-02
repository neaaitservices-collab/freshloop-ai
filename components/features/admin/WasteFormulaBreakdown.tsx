'use client';

import React from 'react';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';
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
}: {
  discard: number;
  scrap: number;
  sales: number;
  bucketCount?: number;
  /** When set, show how scrap $ derives from bucket defaults */
  scrapInputs?: ScrapBucketInputs | Pick<
    PlatformSettings,
    'scrapBucketVolumeL' | 'estimatedWeightPerLiterKg' | 'defaultScrapCostPerKg'
  > | null;
}) {
  const inputs =
    scrapInputs && 'volumeL' in scrapInputs
      ? scrapInputs
      : scrapInputs
        ? scrapBucketInputsFromSettings(scrapInputs)
        : null;

  const econ = inputs ? computeScrapBucketEconomics(inputs) : null;
  const showScrapSteps = econ && bucketCount > 0 && scrap > 0;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5 font-mono sm:text-sm">
        <span className="text-slate-500">(</span>
        <FormulaChip label="discard" value={formatCurrency(discard)} />
        <span className="text-slate-600">+</span>
        <FormulaChip label="scrap" value={formatCurrency(scrap)} accent="text-amber-200/90" />
        <span className="text-slate-500">)</span>
        <span className="text-slate-600">÷</span>
        <FormulaChip label="POS sales" value={formatCurrency(sales)} accent="text-emerald-200/90" />
        <span className="text-slate-500">= waste %</span>
      </div>

      {showScrapSteps ? (
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-400">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Scrap $ breakdown
          </p>
          <p className="mt-1">
            1 bucket: {econ.inputs.volumeL} L × {econ.inputs.densityKgPerL} kg/L ={' '}
            <span className="text-slate-200">{econ.kgPerBucket} kg</span>
          </p>
          <p>
            → {econ.kgPerBucket} kg × ${econ.inputs.costPerKg.toFixed(2)}/kg ={' '}
            <span className="text-amber-200">{formatCurrency(econ.dollarsPerBucket)}</span>
            / bucket
          </p>
          <p>
            → {bucketCount.toFixed(1)} × {formatCurrency(econ.dollarsPerBucket)} ≈{' '}
            <span className="text-amber-200">{formatCurrency(scrap)}</span> scrap on KPI
          </p>
        </div>
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
