import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';

export interface ExecutiveScenario {
  /** Additional waste reduction vs baseline (percentage points, e.g. 2 = 2 pts). */
  wasteImprovementPts: number;
  /** Labor hours recovered per week through better pulls & rescue. */
  laborHoursSavedPerWeek: number;
  /** Fully loaded hourly labor cost ($). */
  laborRatePerHour: number;
  /** Shrink / waste $ reduction from optimized scenario (% of baseline waste $). */
  shrinkReductionPct: number;
}

export const DEFAULT_EXECUTIVE_SCENARIO: ExecutiveScenario = {
  wasteImprovementPts: 2,
  laborHoursSavedPerWeek: 6,
  laborRatePerHour: 22,
  shrinkReductionPct: 15,
};

export interface ExecutiveKpiSummary {
  monthlySavingsUsd: number;
  projectedAnnualRoiUsd: number;
  operationalEfficiencyPct: number;
  wasteCostAvoidedUsd: number;
  laborSavingsUsd: number;
  rescueValueUsd: number;
  baselineWastePct: number | null;
  targetWastePct: number;
  /** Narrative one-liner for executives. */
  headline: string;
}

export interface CostVariancePoint {
  label: string;
  baseline: number;
  optimized: number;
  savings: number;
}

export interface ExecutiveInsight {
  id: string;
  severity: 'success' | 'warning' | 'info';
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  savingsUsd?: number;
}

export interface ExecutiveLiveInputs {
  stats: StoreStats | null;
  wasteKpi: WasteKpiReport | null;
}
