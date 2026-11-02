'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  DollarSign,
  LineChart,
  PiggyBank,
  TrendingUp,
} from 'lucide-react';
import { MetricCard } from '@/components/features/executive/MetricCard';
import { ROIImpactSummary } from '@/components/features/executive/ROIImpactSummary';
import { ActionableInsightBanner } from '@/components/features/executive/ActionableInsightBanner';
import { ExecutiveScenarioPanel } from '@/components/features/executive/ExecutiveScenarioPanel';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import {
  buildCostVarianceSeries,
  buildExecutiveInsights,
  buildExecutiveKpis,
} from '@/lib/domains/executive/financeModel';
import {
  DEFAULT_EXECUTIVE_SCENARIO,
  type ExecutiveScenario,
} from '@/lib/domains/executive/types';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';

const CostVarianceChart = dynamic(
  () =>
    import('@/components/features/executive/CostVarianceChart').then((m) => m.CostVarianceChart),
  {
    loading: () => (
      <div className="h-80 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50" />
    ),
    ssr: false,
  }
);

export function ExecutiveDashboard({
  initialStats,
  initialWasteKpi,
}: {
  initialStats: StoreStats | null;
  initialWasteKpi: WasteKpiReport | null;
}) {
  const [scenario, setScenario] = useState<ExecutiveScenario>(DEFAULT_EXECUTIVE_SCENARIO);

  const liveInputs = useMemo(
    () => ({ stats: initialStats, wasteKpi: initialWasteKpi }),
    [initialStats, initialWasteKpi]
  );

  const kpis = useMemo(
    () => buildExecutiveKpis(liveInputs, scenario),
    [liveInputs, scenario]
  );

  const varianceSeries = useMemo(
    () => buildCostVarianceSeries(liveInputs, scenario),
    [liveInputs, scenario]
  );

  const insights = useMemo(
    () => buildExecutiveInsights(liveInputs, kpis),
    [liveInputs, kpis]
  );

  const topInsight = insights[0];
  const loading = !initialStats;

  return (
    <>
      {topInsight ? <ActionableInsightBanner insight={topInsight} /> : null}

      <section
        className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-2.5"
        aria-label="Executive KPI summary"
      >
        <MetricCard
          label="Monthly savings"
          value={formatCurrency(kpis.monthlySavingsUsd)}
          detail="Scenario: waste + labor"
          icon={PiggyBank}
          accent="text-emerald-400"
          loading={loading}
        />
        <MetricCard
          label="Annual ROI"
          value={formatCurrency(kpis.projectedAnnualRoiUsd)}
          detail="12× monthly (planning)"
          icon={TrendingUp}
          accent="text-blue-300"
          loading={loading}
        />
        <MetricCard
          label="Efficiency"
          value={`${kpis.operationalEfficiencyPct.toFixed(1)}%`}
          detail="Rescue + modeled gains"
          icon={LineChart}
          accent="text-amber-200"
          loading={loading}
        />
        <MetricCard
          label="Waste vs goal"
          value={
            kpis.baselineWastePct != null ? `${kpis.baselineWastePct.toFixed(1)}%` : '—'
          }
          detail={`Goal ≤ ${kpis.targetWastePct}%`}
          icon={DollarSign}
          accent={
            kpis.baselineWastePct != null && kpis.baselineWastePct > kpis.targetWastePct
              ? 'text-rose-400'
              : 'text-emerald-400'
          }
          loading={loading}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <CostVarianceChart data={varianceSeries} loading={loading} />
        </div>
        <div className="hidden min-w-0 lg:block">
          <ExecutiveScenarioPanel scenario={scenario} onChange={setScenario} />
        </div>
      </section>
      <div className="lg:hidden">
        <CollapsibleSection title="Scenario sliders" description="What-if for meetings" defaultOpen={false}>
          <ExecutiveScenarioPanel scenario={scenario} onChange={setScenario} />
        </CollapsibleSection>
      </div>

      <ROIImpactSummary kpis={kpis} loading={loading} />

      {insights.length > 1 ? (
        <CollapsibleSection
          title="More insights"
          description={`${insights.length - 1} additional recommendation(s)`}
          defaultOpen={false}
        >
          <div className="space-y-2">
            {insights.slice(1).map((insight) => (
              <ActionableInsightBanner key={insight.id} insight={insight} />
            ))}
          </div>
        </CollapsibleSection>
      ) : null}
    </>
  );
}

export function ExecutiveDashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-16 animate-pulse rounded-2xl bg-slate-900/80" />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-900/80" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-slate-900/80" />
    </div>
  );
}
