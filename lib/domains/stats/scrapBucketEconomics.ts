import type { PlatformSettings } from '@/lib/domains/stats/platformSettings';

/** Inputs that define $ value of one volumetric scrap bucket log. */
export interface ScrapBucketInputs {
  volumeL: number;
  densityKgPerL: number;
  costPerKg: number;
}

export interface ScrapBucketEconomics {
  inputs: ScrapBucketInputs;
  /** kg trim estimated in one full bucket */
  kgPerBucket: number;
  /** $ charged to waste KPI for one bucket log */
  dollarsPerBucket: number;
}

export interface ScrapLedgerTotals {
  bucketCount: number;
  totalVolumeL: number;
  totalKg: number;
  totalDollars: number;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function scrapBucketInputsFromSettings(
  settings: Pick<
    PlatformSettings,
    'scrapBucketVolumeL' | 'estimatedWeightPerLiterKg' | 'defaultScrapCostPerKg'
  >
): ScrapBucketInputs {
  return {
    volumeL: settings.scrapBucketVolumeL,
    densityKgPerL: settings.estimatedWeightPerLiterKg,
    costPerKg: settings.defaultScrapCostPerKg,
  };
}

/** Step 1: liters → kilograms (trim density). */
export function scrapKgPerBucket(inputs: ScrapBucketInputs): number {
  return round2(inputs.volumeL * inputs.densityKgPerL);
}

/** Step 2: kg × $/kg → $ per bucket (matches ledger & waste KPI). */
export function scrapDollarsPerBucket(inputs: ScrapBucketInputs): number {
  return round2(scrapKgPerBucket(inputs) * inputs.costPerKg);
}

export function computeScrapBucketEconomics(inputs: ScrapBucketInputs): ScrapBucketEconomics {
  return {
    inputs,
    kgPerBucket: scrapKgPerBucket(inputs),
    dollarsPerBucket: scrapDollarsPerBucket(inputs),
  };
}

export function scrapTotalsForBucketCount(
  bucketCount: number,
  inputs: ScrapBucketInputs
): ScrapLedgerTotals {
  const econ = computeScrapBucketEconomics(inputs);
  const count = Number.isFinite(bucketCount) ? bucketCount : 0;
  return {
    bucketCount: count,
    totalVolumeL: round2(count * inputs.volumeL),
    totalKg: round2(count * econ.kgPerBucket),
    totalDollars: round2(count * econ.dollarsPerBucket),
  };
}

export function wasteNumeratorDollars(discardDollars: number, scrapDollars: number): number {
  return round2(discardDollars + scrapDollars);
}

export function describeWasteFormulaBreakdown(params: {
  discard: number;
  scrap: number;
  sales: number;
  wastePct: number | null;
  targetPct: number;
  minSalesForRatio?: number;
}): string {
  const { discard, scrap, sales, wastePct, targetPct, minSalesForRatio = 100 } = params;
  const num = wasteNumeratorDollars(discard, scrap);
  if (wastePct === null) {
    return `(${formatMoney(discard)} discard + ${formatMoney(scrap)} scrap) ÷ ${formatMoney(sales)} sales — need ${formatMoney(minSalesForRatio)}+ sales for official % (goal ${targetPct}%)`;
  }
  return `${formatMoney(num)} waste ÷ ${formatMoney(sales)} sales = ${wastePct.toFixed(2)}% (goal ≤ ${targetPct}%)`;
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}
