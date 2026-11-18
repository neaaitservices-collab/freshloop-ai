import assert from 'node:assert/strict';
import test from 'node:test';
import { adminViewHref } from '@/components/features/admin/AdminViewTabs';
import { resolveAdminDateRange } from '@/lib/domains/stats/adminDateRange';
import { presetRange, torontoRange } from '@/lib/domains/stats/storeTime';

const NOW = new Date('2026-11-18T16:00:00.000Z');

test('empty and invalid admin dates fall back to month-to-date', () => {
  const mtd = presetRange('mtd', NOW);
  assert.deepEqual(mtd, { from: '2026-11-01', to: '2026-11-18' });
  const cases = [
    undefined,
    null,
    {},
    { preset: 'nope' },
    { from: '2026-03-10', to: '2026-03-01' },
    { from: '2026-02-31', to: '2026-03-10' },
    { from: '03/08/2026', to: '2026-03-09' },
    { from: '2025-01-01', to: '2026-01-02' },
    { preset: 'mtd', from: '2026-11-01', to: '2026-11-18' },
    { from: '2026-11-01' },
  ];
  for (const query of cases) {
    const resolved = resolveAdminDateRange(query, NOW);
    assert.equal(resolved.preset, 'mtd');
    assert.equal(resolved.mode, 'preset');
    assert.deepEqual({ from: resolved.from, to: resolved.to }, mtd);
    assert.equal(resolved.label, 'Nov 1–18 · Toronto');
    assert.equal(resolved.dayCount, 18);
    assert.equal(resolved.range.startUtc.toISOString(), torontoRange(mtd.from, mtd.to).startUtc.toISOString());
    assert.equal(resolved.range.endUtc.toISOString(), torontoRange(mtd.from, mtd.to).endUtc.toISOString());
  }
});

test('preset and custom queries resolve, and legacy presets still work', () => {
  const last7 = resolveAdminDateRange({ preset: 'last7' }, NOW);
  assert.equal(last7.preset, 'last7');
  assert.deepEqual({ from: last7.from, to: last7.to }, presetRange('last7', NOW));

  const custom = resolveAdminDateRange({ from: '2026-11-01', to: '2026-11-18' }, NOW);
  assert.equal(custom.mode, 'custom');
  assert.equal(custom.preset, null);
  assert.equal(custom.dayCount, 18);
  assert.equal(custom.label, 'Nov 1–18 · Toronto');

  const week = resolveAdminDateRange({ preset: 'week' }, NOW);
  assert.equal(week.preset, 'week');
  assert.deepEqual({ from: week.from, to: week.to }, presetRange('week', NOW));

  const exact = resolveAdminDateRange({ from: '2025-01-01', to: '2026-01-01' }, NOW);
  assert.equal(exact.mode, 'custom');
  assert.equal(exact.dayCount, 366);
});

test('overview and ROI links keep the date query', () => {
  const preset = new URLSearchParams('preset=last7&other=1');
  assert.equal(adminViewHref('/admin', preset), '/admin?preset=last7');
  assert.equal(adminViewHref('/admin/executive', preset), '/admin/executive?preset=last7');
  assert.equal(adminViewHref('/admin/suppliers', preset), '/admin/suppliers');
  const custom = new URLSearchParams('from=2026-11-01&to=2026-11-18');
  assert.equal(
    adminViewHref('/admin/executive', custom),
    '/admin/executive?from=2026-11-01&to=2026-11-18'
  );
  assert.equal(adminViewHref('/admin', custom), '/admin?from=2026-11-01&to=2026-11-18');
  assert.equal(adminViewHref('/admin/departments', custom), '/admin/departments');
});
