import {
  PRICE_VARIANCE_SOURCE,
  VENDOR_PRICE_ALERT_DEFAULT_PCT,
  type PriceVarianceSource,
} from '@/lib/domains/suppliers/vendorAnalyticsTypes';

export function computeCostVariancePct(
  scannedUnitCost: number,
  benchmarkCost: number
): number | null {
  if (!Number.isFinite(scannedUnitCost) || !Number.isFinite(benchmarkCost)) return null;
  if (benchmarkCost <= 0) return null;
  const pct = ((scannedUnitCost - benchmarkCost) / benchmarkCost) * 100;
  return Number(pct.toFixed(2));
}

export function isPriceVarianceAlert(
  variancePct: number | null,
  thresholdPct: number = VENDOR_PRICE_ALERT_DEFAULT_PCT
): boolean {
  if (variancePct === null || !Number.isFinite(thresholdPct)) return false;
  return Math.abs(variancePct) > thresholdPct;
}

export function priceVarianceReason(
  variancePct: number,
  thresholdPct: number
): string {
  const direction = variancePct > 0 ? 'above' : 'below';
  return `Scanned cost is ${Math.abs(variancePct).toFixed(1)}% ${direction} moving average (alert >${thresholdPct}%).`;
}

export interface PriceVarianceDraft {
  supplierId: string;
  productId: string | null;
  vendorInvoiceId: string | null;
  itemName: string;
  scannedUnitCost: number;
  benchmarkCost: number;
  variancePct: number;
  thresholdPct: number;
  source: PriceVarianceSource;
}

export function buildPriceVarianceDraft(input: {
  supplierId: string;
  productId: string | null;
  vendorInvoiceId?: string | null;
  itemName: string;
  scannedUnitCost: number;
  benchmarkCost: number;
  thresholdPct?: number;
  source?: PriceVarianceSource;
}): PriceVarianceDraft | null {
  const thresholdPct = input.thresholdPct ?? VENDOR_PRICE_ALERT_DEFAULT_PCT;
  const variancePct = computeCostVariancePct(input.scannedUnitCost, input.benchmarkCost);
  if (variancePct === null || !isPriceVarianceAlert(variancePct, thresholdPct)) return null;
  return {
    supplierId: input.supplierId,
    productId: input.productId,
    vendorInvoiceId: input.vendorInvoiceId ?? null,
    itemName: input.itemName.trim() || 'Unknown item',
    scannedUnitCost: Number(input.scannedUnitCost.toFixed(4)),
    benchmarkCost: Number(input.benchmarkCost.toFixed(4)),
    variancePct,
    thresholdPct,
    source: input.source ?? PRICE_VARIANCE_SOURCE.OCR_SCAN,
  };
}
