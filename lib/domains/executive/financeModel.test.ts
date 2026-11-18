import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCostVarianceSeries,
  buildExecutiveKpis,
  monthlyFactorFromLookback,
} from '@/lib/domains/executive/financeModel';
import { DEFAULT_EXECUTIVE_SCENARIO } from '@/lib/domains/executive/types';

test('buildExecutiveKpis returns positive savings with scenario', () => {
  const kpis = buildExecutiveKpis(
    {
      stats: {
        rescuedValue: 500,
        wasteReductionPct: 90,
        targetWastePct: 10,
      } as never,
      wasteKpi: {
        totalWasteValue: 200,
        wastePct: 12,
        targetWastePct: 10,
        grossSalesRevenue: 5000,
      } as never,
    },
    DEFAULT_EXECUTIVE_SCENARIO
  );
  assert.ok(kpis.monthlySavingsUsd > 0);
  assert.ok(kpis.projectedAnnualRoiUsd >= kpis.monthlySavingsUsd);
});

test('monthly factor follows the selected range length', () => {
  assert.equal(monthlyFactorFromLookback(), 1);
  assert.equal(monthlyFactorFromLookback(30), 1);
  assert.equal(monthlyFactorFromLookback(15), 2);
  assert.equal(monthlyFactorFromLookback(0), 1);
  const inputs = {
    stats: { rescuedValue: 300, wasteReductionPct: 0, targetWastePct: 10 } as never,
    wasteKpi: {
      totalWasteValue: 0,
      wastePct: null,
      targetWastePct: 10,
      grossSalesRevenue: 0,
    } as never,
  };
  assert.equal(buildExecutiveKpis(inputs, DEFAULT_EXECUTIVE_SCENARIO, 30).rescueValueUsd, 300);
  assert.equal(buildExecutiveKpis(inputs, DEFAULT_EXECUTIVE_SCENARIO, 15).rescueValueUsd, 600);
  assert.equal(buildExecutiveKpis(inputs, DEFAULT_EXECUTIVE_SCENARIO, 18).rescueValueUsd, 500);
});

test('an empty sales period stays finite', () => {
  const kpis = buildExecutiveKpis(
    {
      stats: { rescuedValue: 0, wasteReductionPct: null, targetWastePct: 10 } as never,
      wasteKpi: {
        totalWasteValue: 80,
        wastePct: null,
        targetWastePct: 10,
        grossSalesRevenue: 0,
      } as never,
    },
    DEFAULT_EXECUTIVE_SCENARIO,
    10
  );
  assert.equal(kpis.baselineWastePct, null);
  assert.equal(kpis.rescueValueUsd, 0);
  assert.equal(Number.isFinite(kpis.monthlySavingsUsd), true);
  assert.equal(Number.isFinite(kpis.projectedAnnualRoiUsd), true);
  assert.equal(Number.isFinite(kpis.operationalEfficiencyPct), true);
  assert.equal(Number.isNaN(kpis.wasteCostAvoidedUsd), false);
  const series = buildCostVarianceSeries(
    { stats: null, wasteKpi: { totalWasteValue: 0, grossSalesRevenue: 0 } as never },
    DEFAULT_EXECUTIVE_SCENARIO,
    0
  );
  assert.equal(series.length, 6);
  assert.ok(series.every((row) => Number.isFinite(row.baseline) && Number.isFinite(row.optimized) && Number.isFinite(row.savings)));
});

test('buildCostVarianceSeries returns 6 months', () => {
  const series = buildCostVarianceSeries(
    { stats: null, wasteKpi: { totalWasteValue: 100 } as never },
    DEFAULT_EXECUTIVE_SCENARIO
  );
  assert.equal(series.length, 6);
  assert.ok(series.every((row) => row.savings >= 0));
});
