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
  /** UTC calendar-day anchors — raw ms span rounds wrong when endDate keeps a time-of-day. */
  const utcMidnight = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const inclusiveCalendarDays =
    (utcMidnight(endDate) - utcMidnight(startDate)) / (24 * 60 * 60 * 1000) + 1;
  assert.equal(inclusiveCalendarDays, DEFAULT_KPI_LOOKBACK_DAYS);
});
