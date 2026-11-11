import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { statsRangeQuerySchema } from '@/lib/security/schemas/statsRange';
import {
  ADMIN_DASHBOARD_WINDOW_LABEL,
  adminDashboardWindow,
  adminDashboardWindowIgnoringQuery,
} from '@/lib/domains/stats/adminDashboardWindow';
import {
  calendarDaysInclusive,
  last30StoreDays,
  torontoRange,
  torontoToday,
} from '@/lib/domains/stats/storeTime';

test('the admin dashboard window is the rolling last 30 Toronto days', () => {
  const now = new Date('2026-06-15T16:00:00.000Z');
  const window = adminDashboardWindow(now);
  const expected = last30StoreDays(now);

  assert.equal(torontoToday(now), '2026-06-15');
  assert.equal(window.from, expected.from);
  assert.equal(window.to, expected.to);
  assert.equal(window.from, '2026-05-17');
  assert.equal(window.to, '2026-06-15');
  assert.equal(window.dayCount, 30);
  assert.equal(calendarDaysInclusive(window.from, window.to), 30);
  assert.equal(window.days.length, 30);
  assert.equal(window.days[0], window.from);
  assert.equal(window.days[29], window.to);
  assert.equal(window.label, 'Last 30 days');
  assert.equal(window.label, ADMIN_DASHBOARD_WINDOW_LABEL);

  const direct = torontoRange(window.from, window.to);
  assert.equal(window.range.startUtc.toISOString(), direct.startUtc.toISOString());
  assert.equal(window.range.endUtc.toISOString(), direct.endUtc.toISOString());
  assert.ok(window.range.startUtc < window.range.endUtc);

  const parsed = statsRangeQuerySchema.safeParse({ from: window.from, to: window.to });
  assert.equal(parsed.success, true);
  assert.equal(window.statsQuery, 'from=2026-05-17&to=2026-06-15');
  assert.equal(window.statsQuery.includes('preset'), false);
});

test('the window rolls on the Toronto midnight boundary, not UTC', () => {
  const before = adminDashboardWindow(new Date('2026-06-15T03:59:00.000Z'));
  const after = adminDashboardWindow(new Date('2026-06-15T04:00:00.000Z'));
  assert.equal(before.to, '2026-06-14');
  assert.equal(before.from, '2026-05-16');
  assert.equal(after.to, '2026-06-15');
  assert.equal(after.from, '2026-05-17');
  assert.equal(before.dayCount, 30);
  assert.equal(after.dayCount, 30);
});

test('Toronto day boundaries inside the window match torontoRange across DST', () => {
  const springNow = new Date('2026-03-08T17:00:00.000Z');
  const spring = adminDashboardWindow(springNow);
  assert.equal(spring.to, '2026-03-08');
  assert.equal(spring.days.includes('2026-03-08'), true);
  const springDay = torontoRange('2026-03-08', '2026-03-08');
  assert.equal(springDay.endUtc.getTime() - springDay.startUtc.getTime(), 23 * 60 * 60 * 1000);
  assert.equal(spring.range.endUtc.toISOString(), torontoRange(spring.from, spring.to).endUtc.toISOString());

  const fall = adminDashboardWindow(new Date('2026-11-02T16:00:00.000Z'));
  assert.equal(fall.to, '2026-11-02');
  assert.equal(fall.days.includes('2026-11-01'), true);
  const fallDay = torontoRange('2026-11-01', '2026-11-01');
  assert.equal(fallDay.endUtc.getTime() - fallDay.startUtc.getTime(), 25 * 60 * 60 * 1000);
  assert.equal(fall.range.startUtc.toISOString(), torontoRange(fall.from, fall.to).startUtc.toISOString());
});

test('old admin range params do not move the window', () => {
  const now = new Date('2026-11-02T16:00:00.000Z');
  const fixed = adminDashboardWindow(now);
  const cases = [
    undefined,
    null,
    {},
    { preset: 'day' },
    { preset: 'week' },
    { preset: 'month' },
    { preset: 'not-a-preset', from: 'nope', to: '' },
    { from: '2020-01-01', to: '2020-01-07' },
    { preset: 'day', from: '2024-06-15', to: '2024-06-15' },
  ];
  for (const query of cases) {
    assert.deepEqual(adminDashboardWindowIgnoringQuery(query, now), fixed);
  }
});

test('the admin dashboard stops rendering range controls and keeps helpers', () => {
  const dashboard = readFileSync('components/features/admin/AdminDashboard.tsx', 'utf8');
  const stats = readFileSync('components/features/admin/AdminStats.tsx', 'utf8');
  const figures = readFileSync('components/features/admin/DashboardFigures.tsx', 'utf8');
  const page = readFileSync('app/admin/page.tsx', 'utf8');
  const api = readFileSync('app/api/admin/stats/route.ts', 'utf8');
  const filter = readFileSync('components/features/admin/StatsDateFilter.tsx', 'utf8');
  const storeStats = readFileSync('lib/domains/stats/storeStats.ts', 'utf8');

  assert.equal(dashboard.includes('StatsDateFilter'), false);
  assert.equal(dashboard.includes('Date range'), false);
  assert.equal(dashboard.includes('Previous range'), false);
  assert.equal(dashboard.includes('transferRangeLabel'), false);
  assert.equal(dashboard.includes('cardRangeLabel'), false);
  assert.match(dashboard, /rangeLabel=\{ADMIN_DASHBOARD_WINDOW_LABEL\}/);
  assert.equal(/\bkitchen\b/i.test(dashboard), false);
  assert.equal(/\bkitchen\b/i.test(stats), false);

  assert.match(stats, /windowLabel=\{windowLabel\}/);
  assert.match(stats, /detail="Now"/);
  assert.equal(stats.includes('cardRangeLabel'), false);
  assert.equal(stats.includes('Value rescued (${'), false);

  assert.match(figures, /adminDashboardWindow\(\)\.statsQuery/);
  assert.equal(figures.includes('transferRangeLabel'), false);
  assert.equal(figures.includes('statsQuery ='), false);

  assert.match(page, /adminDashboardWindowIgnoringQuery\(/);
  assert.match(page, /getAdminStoreStatsBundle\(dashboardWindow\.range\)/);
  assert.equal(page.includes('presetRange'), false);
  assert.equal(page.includes('statsRangeQuerySchema'), false);
  assert.equal(page.includes('rangeError'), false);

  assert.match(api, /presetRange/);
  assert.match(api, /statsRangeQuerySchema/);
  assert.match(filter, /export function StatsDateFilter/);
  assert.match(filter, /last30StoreDays/);

  const inventoryAt = storeStats.indexOf('let inventoryValue = 0;');
  const totalsAt = storeStats.indexOf('const cardTotals');
  assert.ok(inventoryAt !== -1 && totalsAt > inventoryAt);
  const inventoryBlock = storeStats.slice(inventoryAt, totalsAt);
  assert.equal(inventoryBlock.includes('transferRange'), false);
  assert.equal(inventoryBlock.includes('cardBounds'), false);
});
