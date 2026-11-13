import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatsScorecardRows } from '@/components/features/admin/AdminStats';
import {
  controlStatus,
  lostSharePct,
  WasteSemaphoreCard,
} from '@/components/features/admin/WasteSemaphoreCard';
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

test('the admin scorecard is one stats card driven by day week and month chips', () => {
  const dashboard = readFileSync('components/features/admin/AdminDashboard.tsx', 'utf8');
  const stats = readFileSync('components/features/admin/AdminStats.tsx', 'utf8');
  const figures = readFileSync('components/features/admin/DashboardFigures.tsx', 'utf8');
  const semaphore = readFileSync('components/features/admin/WasteSemaphoreCard.tsx', 'utf8');
  const page = readFileSync('app/admin/page.tsx', 'utf8');
  const api = readFileSync('app/api/admin/stats/route.ts', 'utf8');
  const filter = readFileSync('components/features/admin/StatsDateFilter.tsx', 'utf8');
  const storeStats = readFileSync('lib/domains/stats/storeStats.ts', 'utf8');
  const periodClient = readFileSync('lib/domains/stats/adminPeriodClient.ts', 'utf8');
  const chart = readFileSync('components/features/admin/RescueOutcomeChart.tsx', 'utf8');

  assert.match(dashboard, /AdminStatsCard/);
  assert.equal(dashboard.includes('LazyRescueOutcomeChart'), false);
  assert.equal(dashboard.includes('RescueOutcomeChart'), false);
  assert.equal(dashboard.includes('AdminActionCenter'), false);
  assert.equal(dashboard.includes('Rescue rate'), false);
  assert.equal(dashboard.includes('StatsDateFilter'), false);
  assert.equal(/\bkitchen\b/i.test(dashboard), false);
  assert.equal(/\bkitchen\b/i.test(stats), false);
  assert.equal(/\bkitchen\b/i.test(semaphore), false);

  assert.match(stats, /Inventory value/);
  assert.match(stats, /On hand now/);
  assert.match(stats, /Scraps/);
  assert.match(stats, /scrapBucketLabel/);
  assert.match(stats, /Sales/);
  assert.match(stats, /Subtracted from main inventory/);
  assert.match(stats, /Rescued/);
  assert.match(stats, />Lost</);
  assert.match(stats, /Of rescued \+ discarded/);
  assert.match(stats, /variant="chips"/);
  assert.match(stats, /defaultPreset="week"/);
  assert.equal(stats.includes('Rescue rate'), false);
  assert.equal(stats.includes('wasteReductionPct'), false);
  assert.equal(stats.includes('cardRangeLabel'), false);
  assert.equal(stats.includes('<details'), false);

  assert.match(semaphore, /Waste traffic light/);
  assert.match(semaphore, /Over goal/);
  assert.match(semaphore, /On goal/);
  assert.match(semaphore, /≤ \{CONTROL_LOST_GOAL_PCT\}%/);
  assert.equal(semaphore.includes('Waiting for'), false);
  assert.equal(semaphore.includes('POS'), false);
  assert.equal(semaphore.includes('grossSales'), false);
  assert.equal(semaphore.includes('Log POS'), false);

  assert.equal(figures.includes('preset=${activePreset}'), false);
  assert.equal(figures.includes('useSearchParams'), false);
  assert.match(figures, /fetchAdminStats\(''\)/);
  assert.equal(figures.includes('LazyDepartmentAlertsChart'), false);
  assert.equal(figures.includes('LazyRescueOutcomeChart'), false);
  assert.equal(figures.includes('adminDashboardWindow().statsQuery'), false);
  assert.equal(figures.includes('transferRangeLabel'), false);
  assert.equal(figures.includes('statsQuery ='), false);
  assert.match(figures, /short-dated/);
  assert.match(figures, /below par/);
  assert.match(figures, /row\.low > 0 \|\| row\.expiring > 0/);
  assert.match(figures, /setInventoryValue\(result\.stats\.inventoryValue\)/);
  assert.match(figures, /setInventoryValue\(initialStats\.inventoryValue\)/);

  assert.match(stats, /scope=period|periodFiguresQuery|createPeriodLoader/);
  assert.match(stats, /periodPending=\{figures == null\}/);
  assert.equal(stats.includes('setFigures(null)'), false);
  assert.match(stats, /Updating/);
  assert.match(periodClient, /scope=period/);
  assert.match(periodClient, /AbortController/);
  assert.match(periodClient, /myTicket !== ticket/);
  assert.match(filter, /variant === 'chips'/);
  assert.match(filter, /aria-label="Stats range"/);
  assert.match(filter, /export function StatsDateFilter/);
  assert.match(filter, /const selectChip/);
  const selectChip = filter.slice(filter.indexOf('const selectChip'), filter.indexOf('const bounds'));
  assert.equal(selectChip.includes('router'), false);
  assert.equal(selectChip.includes('writeRange'), false);
  assert.match(selectChip, /setChip\(id\)/);
  assert.match(selectChip, /onPresetChange\?\.\(id\)/);
  assert.match(filter, /last30StoreDays/);
  assert.match(chart, /export function RescueOutcomeChart/);

  assert.match(page, /adminDashboardWindowIgnoringQuery\(/);
  assert.match(page, /getAdminStoreStatsBundle\(dashboardWindow\.range\)/);
  assert.equal(page.includes('presetRange'), false);
  assert.equal(page.includes('statsRangeQuerySchema'), false);
  assert.equal(page.includes('rangeError'), false);

  assert.match(api, /presetRange/);
  assert.match(api, /statsRangeQuerySchema/);
  assert.match(api, /scope === 'period'/);
  assert.match(api, /getAdminPeriodFigures\(range\)/);
  const periodCall = api.indexOf('getAdminPeriodFigures(range)');
  const bundleCall = api.indexOf('getAdminStoreStatsBundle(range)');
  assert.ok(periodCall !== -1 && bundleCall !== -1 && periodCall < bundleCall);

  assert.match(storeStats, /export function getAdminPeriodFigures/);
  assert.match(storeStats, /calculateRealTimeWastePct\(wasteKpiOptions\(transferRange\)\)/);
  const periodFn = storeStats.slice(
    storeStats.indexOf('async function loadAdminPeriodFigures'),
    storeStats.indexOf('async function loadStatProducts')
  );
  assert.match(periodFn, /Promise\.all/);
  assert.equal(periodFn.includes('getStockLevels'), false);
  assert.equal(periodFn.includes('outcomeDays'), false);
  assert.equal(periodFn.includes('departmentAlerts'), false);
  assert.equal(periodFn.includes('inventoryValue'), false);
  assert.equal(periodFn.includes('findMany'), false);
  assert.equal(storeStats.includes('inventoryTransaction.findMany'), false);
  assert.match(storeStats, /endUtc\.getTime\(\) - 1/);
  const inventoryAt = storeStats.indexOf('let inventoryValue = 0;');
  const totalsAt = storeStats.indexOf('const cardTotals');
  assert.ok(inventoryAt !== -1 && totalsAt > inventoryAt);
  const inventoryBlock = storeStats.slice(inventoryAt, totalsAt);
  assert.equal(inventoryBlock.includes('transferRange'), false);
  assert.equal(inventoryBlock.includes('cardBounds'), false);
  assert.equal(inventoryBlock.includes('wasteKpiOptions'), false);
});

test('lost percent is discarded over rescued plus discarded and lights a 10 percent goal', () => {
  assert.equal(lostSharePct(0, 0), null);
  assert.equal(lostSharePct(100, 0), 0);
  assert.equal(lostSharePct(0, 50), 100);
  assert.equal(lostSharePct(1032, 753.47), 42.2);
  assert.equal(lostSharePct(90, 10), 10);
  assert.equal(controlStatus(null), 'on');
  assert.equal(controlStatus(10), 'on');
  assert.equal(controlStatus(10.1), 'over');
  assert.equal(controlStatus(42.2), 'over');
});

test('the scorecard renders control, inventory, scraps, sales, rescued, and lost once', () => {
  const html = renderToStaticMarkup(
    createElement(StatsScorecardRows, {
      periodPending: false,
      rescued: 1032,
      lost: 753.47,
      inventoryValue: 5533.6,
      scrapDollars: 20.8,
      scrapBuckets: 8,
      sales: 0,
    })
  );
  const control = html.indexOf('Control');
  const inventory = html.indexOf('Inventory value');
  const scraps = html.indexOf('Scraps');
  const sales = html.indexOf('Sales');
  const rescued = html.indexOf('Rescued');
  const lost = html.indexOf('>Lost<');
  assert.ok(control >= 0 && control < inventory);
  assert.ok(inventory < scraps && scraps < sales && sales < rescued && rescued < lost);
  assert.match(html, /Over goal/);
  assert.match(html, /≤ 10%/);
  assert.match(html, /On hand now/);
  assert.match(html, /\$5,533\.60/);
  assert.match(html, /\$20\.80/);
  assert.match(html, /8 buckets/);
  assert.match(html, /Subtracted from main inventory/);
  assert.match(html, /\$0\.00/);
  assert.match(html, /\$1,032/);
  assert.match(html, /42\.2%/);
  assert.match(html, /Of rescued \+ discarded/);
  assert.equal(html.includes('Rescue rate'), false);
  assert.equal(html.includes('Waiting for'), false);
  assert.equal(html.includes('POS'), false);
  assert.equal(html.includes('$5,433.60'), false);
  assert.equal(html.includes('$1.00'), false);

  const quiet = renderToStaticMarkup(
    createElement(StatsScorecardRows, {
      periodPending: false,
      rescued: 0,
      lost: 0,
      inventoryValue: 10,
      scrapDollars: 0,
      scrapBuckets: 0,
      sales: 0,
    })
  );
  assert.match(quiet, /On goal/);
  assert.match(quiet, /≤ 10%/);
  assert.match(quiet, /0 buckets/);
  assert.match(quiet, /\$0\.00/);
  assert.match(quiet, />—</);
  assert.equal(quiet.includes('Waiting for'), false);
  assert.equal(quiet.includes('POS'), false);
  assert.equal(quiet.includes('Rescue rate'), false);

  const pending = renderToStaticMarkup(
    createElement(WasteSemaphoreCard, { lostPct: null, pending: true })
  );
  assert.match(pending, /Updating/);
  assert.match(pending, /≤ 10%/);
  assert.match(pending, /Waste traffic light/);
  assert.equal(pending.includes('On goal'), false);
  assert.equal(pending.includes('Waiting for'), false);
  assert.equal(pending.includes('POS'), false);
});
