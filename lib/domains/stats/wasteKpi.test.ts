import assert from 'node:assert/strict';
import test from 'node:test';
import { torontoRange } from '@/lib/domains/stats/storeTime';
import {
  computeWastePct,
  DEFAULT_KPI_LOOKBACK_DAYS,
  halfOpenWasteBounds,
  kpiLookbackRange,
  MIN_GROSS_SALES_FOR_WASTE_RATIO,
  officialWastePctLabel,
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

test('official waste label stays a dash when the ratio is withheld', () => {
  assert.equal(computeWastePct(40, MIN_GROSS_SALES_FOR_WASTE_RATIO - 1), null);
  assert.equal(officialWastePctLabel(null), '—');
  assert.equal(officialWastePctLabel(0), '0.0%');
  assert.equal(officialWastePctLabel(2.5), '2.5%');
  assert.equal(officialWastePctLabel(150), '>100%');
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

test('a passed store range stays half-open and does not clip the end by a millisecond', () => {
  const range = torontoRange('2026-03-08', '2026-03-08');
  const bounds = halfOpenWasteBounds(range);
  assert.equal(bounds.endExclusive, true);
  assert.equal(bounds.startDate.toISOString(), range.startUtc.toISOString());
  assert.equal(bounds.endDate.toISOString(), range.endUtc.toISOString());
  assert.equal(bounds.endDate.toISOString(), '2026-03-09T04:00:00.000Z');
  assert.notEqual(bounds.endDate.getTime(), range.endUtc.getTime() - 1);
});
