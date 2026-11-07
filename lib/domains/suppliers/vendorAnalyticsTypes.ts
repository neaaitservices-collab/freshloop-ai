export const VENDOR_PRICE_ALERT_DEFAULT_PCT = 5;

export const SUPPLIER_QUALITY_EVENT = {
  OCR_LOW_CONFIDENCE: 'OCR_LOW_CONFIDENCE',
  OCR_UNMATCHED_LINE: 'OCR_UNMATCHED_LINE',
  NOT_RECEIVED: 'NOT_RECEIVED',
  PRICE_VARIANCE: 'PRICE_VARIANCE',
  ARRIVAL_SPOILAGE: 'ARRIVAL_SPOILAGE',
} as const;

export type SupplierQualityEventType =
  (typeof SUPPLIER_QUALITY_EVENT)[keyof typeof SUPPLIER_QUALITY_EVENT];

export const PRICE_VARIANCE_SOURCE = {
  OCR_SCAN: 'OCR_SCAN',
  RECEIVING: 'RECEIVING',
} as const;

export type PriceVarianceSource =
  (typeof PRICE_VARIANCE_SOURCE)[keyof typeof PRICE_VARIANCE_SOURCE];

export interface SupplierScorecard {
  supplierId: string;
  supplierName: string;
  lookbackDays: number;
  periodStart: string;
  periodEnd: string;
  invoiceCount: number;
  invoiceLineCount: number;
  ocrLowConfidenceCount: number;
  ocrLowConfidenceRate: number;
  unmatchedLineCount: number;
  notReceivedCount: number;
  discrepancyRate: number;
  priceVarianceCount: number;
  priceVarianceRate: number;
  avgPriceVariancePct: number | null;
  spoilageCount: number;
  spoilageRate: number;
  reliabilityScore: number;
}

export interface PriceVarianceAlertRow {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: string | null;
  itemName: string;
  scannedUnitCost: number;
  benchmarkCost: number;
  variancePct: number;
  thresholdPct: number;
  source: string;
  createdAt: string;
}

export interface VendorAnalyticsBundle {
  lookbackDays: number;
  priceAlertThresholdPct: number;
  scorecards: SupplierScorecard[];
  recentPriceAlerts: PriceVarianceAlertRow[];
}
