export interface PlatformSettings {
  storeName: string;
  targetWastePct: number;
  scrapBucketVolumeL: number;
  estimatedWeightPerLiterKg: number;
  defaultScrapCostPerKg: number;
  defaultLaborRatePerHour: number;
  pullSensitivityDays: number;
  costGuardrailVariancePct: number;
  /** Absolute percent that flags a supplier price change. */
  priceChangeThresholdPct: number;
  /** Default minimum stock in cases (Orders par / low-stock alerts). */
  defaultParCases: number;
}

export const PLATFORM_DEFAULTS: PlatformSettings = {
  storeName: 'FreshLoop Independent Market',
  targetWastePct: 2.5,
  scrapBucketVolumeL: 20,
  estimatedWeightPerLiterKg: 0.65,
  defaultScrapCostPerKg: 3.5,
  defaultLaborRatePerHour: 17.6,
  pullSensitivityDays: 3,
  costGuardrailVariancePct: 20,
  priceChangeThresholdPct: 8,
  defaultParCases: 2,
};
