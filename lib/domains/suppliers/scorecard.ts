import type { SupplierScorecard } from '@/lib/domains/suppliers/vendorAnalyticsTypes';

function clampPct(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return Number(Math.min(100, Math.max(0, rate)).toFixed(2));
}

/** Weighted 0–100 reliability score from operational rates (higher is better). */
export function computeReliabilityScore(metrics: {
  ocrLowConfidenceRate: number;
  discrepancyRate: number;
  priceVarianceRate: number;
  spoilageRate: number;
}): number {
  const penalty =
    metrics.ocrLowConfidenceRate * 0.4 +
    metrics.discrepancyRate * 0.3 +
    metrics.priceVarianceRate * 0.2 +
    metrics.spoilageRate * 0.1;
  return Number(Math.max(0, Math.min(100, 100 - penalty)).toFixed(1));
}

export function buildSupplierScorecard(input: {
  supplierId: string;
  supplierName: string;
  lookbackDays: number;
  periodStart: Date;
  periodEnd: Date;
  invoiceCount: number;
  invoiceLineCount: number;
  ocrLowConfidenceCount: number;
  unmatchedLineCount: number;
  notReceivedCount: number;
  priceVarianceCount: number;
  avgPriceVariancePct: number | null;
  spoilageCount: number;
  receivingVolume: number;
}): SupplierScorecard {
  const denominator = Math.max(1, input.invoiceLineCount + input.receivingVolume);
  const ocrLowConfidenceRate = clampPct(
    (input.ocrLowConfidenceCount / denominator) * 100
  );
  const unmatchedRate = clampPct((input.unmatchedLineCount / denominator) * 100);
  const discrepancyRate = clampPct(
    ((input.notReceivedCount + input.unmatchedLineCount) / denominator) * 100
  );
  const priceVarianceRate = clampPct((input.priceVarianceCount / denominator) * 100);
  const spoilageRate = clampPct((input.spoilageCount / denominator) * 100);

  const reliabilityScore = computeReliabilityScore({
    ocrLowConfidenceRate: ocrLowConfidenceRate + unmatchedRate * 0.5,
    discrepancyRate,
    priceVarianceRate,
    spoilageRate,
  });

  return {
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    lookbackDays: input.lookbackDays,
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    invoiceCount: input.invoiceCount,
    invoiceLineCount: input.invoiceLineCount,
    ocrLowConfidenceCount: input.ocrLowConfidenceCount,
    ocrLowConfidenceRate,
    unmatchedLineCount: input.unmatchedLineCount,
    notReceivedCount: input.notReceivedCount,
    discrepancyRate,
    priceVarianceCount: input.priceVarianceCount,
    priceVarianceRate,
    avgPriceVariancePct: input.avgPriceVariancePct,
    spoilageCount: input.spoilageCount,
    spoilageRate,
    reliabilityScore,
  };
}

export function scorecardGrade(score: number): 'excellent' | 'good' | 'watch' | 'critical' {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 55) return 'watch';
  return 'critical';
}
