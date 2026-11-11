import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addCalendarDays,
  calendarDaysInclusive,
  calendarMonthContaining,
  sundayWeekContaining,
  torontoRange,
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

test('stats range query rejects bad dates, inverted ranges, long spans, and mixed params', () => {
  assert.equal(statsRangeQuerySchema.safeParse({}).success, true);
  assert.equal(statsRangeQuerySchema.safeParse({ preset: 'week' }).success, true);
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
