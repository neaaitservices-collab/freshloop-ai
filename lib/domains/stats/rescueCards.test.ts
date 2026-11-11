import assert from 'node:assert/strict';
import test from 'node:test';
import {
  rescueRateLabel,
  rescueRatePct,
  summarizeRescueWindow,
} from '@/lib/domains/stats/rescueCards';
import {
  calendarDaysInclusive,
  formatCardRangeLabel,
  last30StoreDays,
  torontoRange,
  torontoToday,
} from '@/lib/domains/stats/storeTime';

test('an empty rescue window shows a dash rate', () => {
  const empty = summarizeRescueWindow([]);
  assert.equal(empty.rescued, 0);
  assert.equal(empty.lost, 0);
  assert.equal(empty.rate, null);
  assert.equal(rescueRateLabel(empty.rate), '—');
  assert.equal(rescueRatePct(0, 0), null);
});

test('range totals add rescued and lost and the rate uses both', () => {
  const totals = summarizeRescueWindow([
    { recovered: 30, lost: 10, rescueUnits: 3, discardUnits: 1 },
    { recovered: 10, lost: 0, rescueUnits: 1, discardUnits: 0 },
  ]);
  assert.equal(totals.rescued, 40);
  assert.equal(totals.lost, 10);
  assert.equal(totals.rescueUnits, 4);
  assert.equal(totals.rate, 80);
  assert.equal(rescueRateLabel(totals.rate), '80.0%');
});

test('the default card window is the last 30 Toronto days', () => {
  const now = new Date('2026-06-15T16:00:00.000Z');
  const days = last30StoreDays(now);
  assert.equal(torontoToday(now), '2026-06-15');
  assert.equal(days.to, '2026-06-15');
  assert.equal(days.from, '2026-05-17');
  assert.equal(calendarDaysInclusive(days.from, days.to), 30);
  const range = torontoRange(days.from, days.to);
  assert.ok(range.startUtc < range.endUtc);
  assert.equal(formatCardRangeLabel('2026-11-01', '2026-11-10'), 'Nov 1–10');
});

test('Toronto day boundaries stay half-open across DST', () => {
  const spring = torontoRange('2026-03-08', '2026-03-08');
  assert.equal(spring.endUtc.getTime() - spring.startUtc.getTime(), 23 * 60 * 60 * 1000);
  assert.ok(new Date(spring.startUtc.getTime() - 1) < spring.startUtc);
  assert.ok(new Date(spring.endUtc.getTime() - 1) < spring.endUtc);
  const fall = torontoRange('2026-11-01', '2026-11-01');
  assert.equal(fall.endUtc.getTime() - fall.startUtc.getTime(), 25 * 60 * 60 * 1000);
  assert.equal(formatCardRangeLabel('2026-03-08', '2026-03-08'), 'Mar 8');
});
