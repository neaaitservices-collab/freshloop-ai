import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCostVarianceSeries,
  buildExecutiveKpis,
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

test('buildCostVarianceSeries returns 6 months', () => {
  const series = buildCostVarianceSeries(
    { stats: null, wasteKpi: { totalWasteValue: 100 } as never },
    DEFAULT_EXECUTIVE_SCENARIO
  );
  assert.equal(series.length, 6);
  assert.ok(series.every((row) => row.savings >= 0));
});
