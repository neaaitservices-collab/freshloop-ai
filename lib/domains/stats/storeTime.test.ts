import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addCalendarDays,
  calendarDaysInclusive,
  calendarMonthContaining,
  formatAdminRangeLabel,
  presetRange,
  statsBoundsCacheKey,
  sundayWeekContaining,
  torontoRange,
  torontoToday,
  torontoWeekdayIndex,
} from '@/lib/domains/stats/storeTime';
import { statsRangeQuerySchema } from '@/lib/security/schemas/statsRange';
import { isInboundProductionTransfer } from '@/lib/domains/inventory/kitchenInbox';

test('spring-forward and fall-back days stay half-open', () => {
  const spring = torontoRange('2026-03-08', '2026-03-08');
  assert.equal(spring.endUtc.getTime() - spring.startUtc.getTime(), 23 * 60 * 60 * 1000);
  const fall = torontoRange('2026-11-01', '2026-11-01');
  assert.equal(fall.endUtc.getTime() - fall.startUtc.getTime(), 25 * 60 * 60 * 1000);
  const ordinary = torontoRange('2026-06-15', '2026-06-15');
  assert.equal(ordinary.endUtc.getTime() - ordinary.startUtc.getTime(), 24 * 60 * 60 * 1000);
});

test('weeks start on Sunday and months are calendar months', () => {
  assert.equal(torontoWeekdayIndex('2026-03-08'), 0);
  assert.deepEqual(sundayWeekContaining('2026-03-11'), { from: '2026-03-08', to: '2026-03-14' });
  assert.deepEqual(sundayWeekContaining('2026-03-08'), { from: '2026-03-08', to: '2026-03-14' });
  assert.deepEqual(calendarMonthContaining('2026-03-15'), { from: '2026-03-01', to: '2026-03-31' });
  assert.deepEqual(calendarMonthContaining('2024-02-10'), { from: '2024-02-01', to: '2024-02-29' });
  assert.deepEqual(calendarMonthContaining('2026-02-10'), { from: '2026-02-01', to: '2026-02-28' });
  assert.equal(addCalendarDays('2026-03-08', 1), '2026-03-09');
});

test('admin presets stay on the Toronto calendar, including the first of the month', () => {
  const first = new Date('2026-03-01T17:00:00.000Z');
  assert.equal(torontoToday(first), '2026-03-01');
  assert.deepEqual(presetRange('today', first), { from: '2026-03-01', to: '2026-03-01' });
  assert.deepEqual(presetRange('mtd', first), { from: '2026-03-01', to: '2026-03-01' });
  assert.deepEqual(presetRange('last7', first), { from: '2026-02-23', to: '2026-03-01' });
  assert.deepEqual(presetRange('lastMonth', first), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(presetRange('month', first), { from: '2026-03-01', to: '2026-03-31' });
  assert.deepEqual(presetRange('day', first), presetRange('today', first));

  const marchEnd = new Date('2026-03-31T16:00:00.000Z');
  assert.equal(torontoToday(marchEnd), '2026-03-31');
  assert.deepEqual(presetRange('lastMonth', marchEnd), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(presetRange('mtd', marchEnd), { from: '2026-03-01', to: '2026-03-31' });

  const januaryEnd = new Date('2026-01-31T17:00:00.000Z');
  assert.equal(torontoToday(januaryEnd), '2026-01-31');
  assert.deepEqual(presetRange('lastMonth', januaryEnd), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(presetRange('lastMonth', new Date('2024-03-01T17:00:00.000Z')), {
    from: '2024-02-01',
    to: '2024-02-29',
  });
  assert.equal(formatAdminRangeLabel('2026-11-01', '2026-11-18'), 'Nov 1–18 · Toronto');
});

test('today is half-open across Toronto DST midnights', () => {
  const springNow = new Date('2026-03-08T17:00:00.000Z');
  const springBounds = presetRange('today', springNow);
  assert.deepEqual(springBounds, { from: '2026-03-08', to: '2026-03-08' });
  const spring = torontoRange(springBounds.from, springBounds.to);
  assert.equal(spring.startUtc.toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(spring.endUtc.toISOString(), '2026-03-09T04:00:00.000Z');
  assert.equal(spring.endUtc.getTime() - spring.startUtc.getTime(), 23 * 60 * 60 * 1000);
  assert.equal(spring.endUtc.toISOString(), torontoRange('2026-03-09', '2026-03-09').startUtc.toISOString());
  assert.ok(new Date(spring.endUtc.getTime() - 1) < spring.endUtc);

  const fallNow = new Date('2026-11-01T16:00:00.000Z');
  const fallBounds = presetRange('today', fallNow);
  assert.deepEqual(fallBounds, { from: '2026-11-01', to: '2026-11-01' });
  const fall = torontoRange(fallBounds.from, fallBounds.to);
  assert.equal(fall.startUtc.toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(fall.endUtc.toISOString(), '2026-11-02T05:00:00.000Z');
  assert.equal(fall.endUtc.getTime() - fall.startUtc.getTime(), 25 * 60 * 60 * 1000);
  assert.equal(fall.endUtc.toISOString(), torontoRange('2026-11-02', '2026-11-02').startUtc.toISOString());

  const fixed = torontoRange('2026-06-01', '2026-06-10');
  const beforeMidnight = new Date('2026-06-15T03:30:00.000Z');
  const afterMidnight = new Date('2026-06-15T04:30:00.000Z');
  assert.equal(torontoToday(beforeMidnight), '2026-06-14');
  assert.equal(torontoToday(afterMidnight), '2026-06-15');
  assert.notEqual(statsBoundsCacheKey(fixed, beforeMidnight), statsBoundsCacheKey(fixed, afterMidnight));
  assert.match(statsBoundsCacheKey(fixed, afterMidnight), /2026-06-01T04:00:00.000Z\|2026-06-11T04:00:00.000Z\|2026-06-15/);
});

test('stats range query rejects bad dates, inverted ranges, long spans, and mixed params', () => {
  assert.equal(statsRangeQuerySchema.safeParse({}).success, true);
  assert.equal(statsRangeQuerySchema.safeParse({ preset: 'week' }).success, true);
  assert.equal(statsRangeQuerySchema.safeParse({ preset: 'today' }).success, true);
  assert.equal(statsRangeQuerySchema.safeParse({ preset: 'last7' }).success, true);
  assert.equal(statsRangeQuerySchema.safeParse({ preset: 'mtd' }).success, true);
  assert.equal(statsRangeQuerySchema.safeParse({ preset: 'lastMonth' }).success, true);
  assert.equal(statsRangeQuerySchema.safeParse({ preset: 'nope' }).success, false);
  assert.equal(
    statsRangeQuerySchema.safeParse({ from: '2026-01-01', to: '2026-01-02' }).success,
    true
  );
  assert.equal(statsRangeQuerySchema.safeParse({ from: '03/08/2026', to: '2026-03-09' }).success, false);
  assert.equal(statsRangeQuerySchema.safeParse({ from: '2026-02-31', to: '2026-03-01' }).success, false);
  assert.equal(statsRangeQuerySchema.safeParse({ from: '2026-03-10', to: '2026-03-01' }).success, false);
  assert.equal(
    statsRangeQuerySchema.safeParse({ preset: 'day', from: '2026-03-01', to: '2026-03-02' }).success,
    false
  );
  const tooLong = calendarDaysInclusive('2025-01-01', '2026-01-02');
  assert.equal(tooLong, 367);
  assert.equal(
    statsRangeQuerySchema.safeParse({ from: '2025-01-01', to: '2026-01-02' }).success,
    false
  );
  assert.equal(
    statsRangeQuerySchema.safeParse({ from: '2025-01-01', to: '2026-01-01' }).success,
    true
  );
});

test('a production transfer counts the inbound leg only', () => {
  const rows = [
    { transactionType: 'Rescue' as const, toLocation: 'Kitchen_Prep' as const, qtyChange: 4 },
    { transactionType: 'Rescue' as const, toLocation: 'Kitchen_Prep' as const, qtyChange: -4 },
    { transactionType: 'Rescue' as const, toLocation: 'Retail_Floor' as const, qtyChange: 4 },
  ];
  const units = rows.reduce(
    (sum, row) => (isInboundProductionTransfer(row) ? sum + row.qtyChange : sum),
    0
  );
  assert.equal(units, 4);
});
