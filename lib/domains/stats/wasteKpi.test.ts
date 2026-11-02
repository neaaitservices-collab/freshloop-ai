import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeWastePct,
  DEFAULT_KPI_LOOKBACK_DAYS,
  kpiLookbackRange,
  MIN_GROSS_SALES_FOR_WASTE_RATIO,
} from '@/lib/domains/stats/wasteKpi';

test('computeWastePct returns null when gross sales are below the floor', () => {
  assert.equal(computeWastePct(50, MIN_GROSS_SALES_FOR_WASTE_RATIO - 1), null);
});

test('computeWastePct returns zero when there is no waste', () => {
  assert.equal(computeWastePct(0, 10_000), 0);
});

test('computeWastePct matches waste dollars over gross sales', () => {
  assert.equal(computeWastePct(250, 10_000), 2.5);
});

test('computeWastePct caps extreme ratios', () => {
  assert.equal(computeWastePct(50_000, 100), 999.99);
});

test('kpiLookbackRange spans DEFAULT_KPI_LOOKBACK_DAYS inclusive', () => {
  const end = new Date('2026-03-15T15:30:00Z');
  const { startDate, endDate } = kpiLookbackRange(DEFAULT_KPI_LOOKBACK_DAYS, end);
  const days =
    Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  assert.equal(days, DEFAULT_KPI_LOOKBACK_DAYS);
});
