import type {
  CostVariancePoint,
  ExecutiveInsight,
  ExecutiveKpiSummary,
  ExecutiveLiveInputs,
  ExecutiveScenario,
} from '@/lib/domains/executive/types';
import { DEFAULT_KPI_LOOKBACK_DAYS } from '@/lib/domains/stats/wasteKpi';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function lookbackToMonthlyFactor(): number {
  return 30 / DEFAULT_KPI_LOOKBACK_DAYS;
}

/** Scale ledger window metrics to approximate calendar month. */
export function monthlyFactorFromLookback(): number {
  return lookbackToMonthlyFactor();
}

export function buildExecutiveKpis(
  inputs: ExecutiveLiveInputs,
  scenario: ExecutiveScenario
): ExecutiveKpiSummary {
  const { stats, wasteKpi } = inputs;
  const monthScale = monthlyFactorFromLookback();

  const rescueValueUsd = roundMoney((stats?.rescuedValue ?? 0) * monthScale);
  const baselineWasteUsd = roundMoney((wasteKpi?.totalWasteValue ?? 0) * monthScale);
  const targetWastePct = wasteKpi?.targetWastePct ?? stats?.targetWastePct ?? 10;
  const baselineWastePct = wasteKpi?.wastePct ?? stats?.wastePct ?? null;

  const shrinkReduction = Math.min(100, Math.max(0, scenario.shrinkReductionPct)) / 100;
  const wasteFromScenario =
    baselineWasteUsd * shrinkReduction +
    (baselineWastePct != null && scenario.wasteImprovementPts > 0
      ? baselineWasteUsd * (scenario.wasteImprovementPts / Math.max(baselineWastePct, 0.1)) * 0.35
      : 0);

  const wasteCostAvoidedUsd = roundMoney(Math.min(baselineWasteUsd, wasteFromScenario));
  const laborSavingsUsd = roundMoney(
    scenario.laborHoursSavedPerWeek * 4.33 * scenario.laborRatePerHour
  );
  const monthlySavingsUsd = roundMoney(wasteCostAvoidedUsd + laborSavingsUsd);
  const projectedAnnualRoiUsd = roundMoney(monthlySavingsUsd * 12);

  const rescueRate = stats?.wasteReductionPct ?? 0;
  const operationalEfficiencyPct = Number(
    Math.min(99.9, rescueRate + scenario.wasteImprovementPts * 2 + shrinkReduction * 10).toFixed(1)
  );

  const headline =
    monthlySavingsUsd > 0
      ? `Optimized rescue & waste controls could return ~$${monthlySavingsUsd.toLocaleString()}/mo to margin.`
      : 'Log POS sales and waste events to quantify store-level ROI.';

  return {
    monthlySavingsUsd,
    projectedAnnualRoiUsd,
    operationalEfficiencyPct,
    wasteCostAvoidedUsd,
    laborSavingsUsd,
    rescueValueUsd,
    baselineWastePct,
    targetWastePct,
    headline,
  };
}

export function buildCostVarianceSeries(
  inputs: ExecutiveLiveInputs,
  scenario: ExecutiveScenario
): CostVariancePoint[] {
  const monthScale = monthlyFactorFromLookback();
  const anchorBaseline = roundMoney((inputs.wasteKpi?.totalWasteValue ?? 4200) * monthScale + 8000);
  const optimizationRate =
    Math.min(0.45, scenario.shrinkReductionPct / 100 + scenario.wasteImprovementPts * 0.02);

  const now = new Date();
  const points: CostVariancePoint[] = [];

  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = MONTH_LABELS[d.getMonth()] ?? '—';
    const season = 0.92 + (5 - i) * 0.015;
    const baseline = roundMoney(anchorBaseline * season * (0.88 + i * 0.04));
    const optimized = roundMoney(baseline * (1 - optimizationRate));
    points.push({
      label,
      baseline,
      optimized,
      savings: roundMoney(baseline - optimized),
    });
  }

  return points;
}

export function buildExecutiveInsights(
  inputs: ExecutiveLiveInputs,
  kpis: ExecutiveKpiSummary
): ExecutiveInsight[] {
  const insights: ExecutiveInsight[] = [];
  const sales = inputs.wasteKpi?.grossSalesRevenue ?? inputs.stats?.grossSalesRevenue ?? 0;
  const waste = inputs.wasteKpi?.totalWasteValue ?? 0;

  if (sales > 0 && sales < 100) {
    insights.push({
      id: 'pos-thin',
      severity: 'warning',
      title: 'POS sales too thin for board-ready waste %',
      body: 'Connect daily POS totals so waste KPIs convert to credible ROI slides for leadership.',
      ctaLabel: 'Review waste goal',
      ctaHref: '/admin/settings#waste-pulls',
    });
  }

  if (kpis.baselineWastePct != null && kpis.baselineWastePct > kpis.targetWastePct) {
    insights.push({
      id: 'waste-above-goal',
      severity: 'warning',
      title: 'Waste above goal — margin at risk',
      body: `Running ${kpis.baselineWastePct.toFixed(1)}% vs ${kpis.targetWastePct}% target. Floor rescue on Operations is the fastest payback.`,
      ctaLabel: 'Open Operations',
      ctaHref: '/operations',
      savingsUsd: kpis.wasteCostAvoidedUsd,
    });
  } else if (kpis.rescueValueUsd > 0) {
    insights.push({
      id: 'rescue-strong',
      severity: 'success',
      title: 'Kitchen rescue is protecting revenue',
      body: `~$${kpis.rescueValueUsd.toLocaleString()} retail equivalent rescued this period (monthly est.).`,
      ctaLabel: 'View ledger charts',
      ctaHref: '/admin',
    });
  }

  if (waste > 0 && (inputs.wasteKpi?.volumetricScrapBucketsCount ?? 0) > 0) {
    insights.push({
      id: 'scrap-buckets',
      severity: 'info',
      title: 'Scrap bucket defaults drive KPI dollars',
      body: 'Validate L × kg/L × $/kg so kitchen logs map to realistic financial impact.',
      ctaLabel: 'Bucket $ settings',
      ctaHref: '/admin/settings#kitchen-scrap',
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'baseline',
      severity: 'info',
      title: 'Baseline established',
      body: 'Adjust scenario sliders to model labor and shrink improvements for stakeholder meetings.',
    });
  }

  return insights;
}
