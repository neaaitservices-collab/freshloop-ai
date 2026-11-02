import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeScrapBucketEconomics,
  describeWasteFormulaBreakdown,
  scrapDollarsPerBucket,
  scrapKgPerBucket,
  scrapTotalsForBucketCount,
  wasteNumeratorDollars,
} from '@/lib/domains/stats/scrapBucketEconomics';

const DEFAULT = { volumeL: 20, densityKgPerL: 0.65, costPerKg: 3.5 };

test('computes kg then $ per bucket (20L × 0.65 × 3.5)', () => {
  assert.equal(scrapKgPerBucket(DEFAULT), 13);
  assert.equal(scrapDollarsPerBucket(DEFAULT), 45.5);
  assert.equal(computeScrapBucketEconomics(DEFAULT).dollarsPerBucket, 45.5);
});

test('scales bucket count to ledger scrap $', () => {
  const totals = scrapTotalsForBucketCount(6, DEFAULT);
  assert.equal(totals.totalDollars, 273);
  assert.equal(totals.totalKg, 78);
});

test('sums discard + scrap for waste numerator', () => {
  assert.equal(wasteNumeratorDollars(24.27, 273), 297.27);
});

test('describeWasteFormulaBreakdown when sales too thin', () => {
  const line = describeWasteFormulaBreakdown({
    discard: 24.27,
    scrap: 273,
    sales: 87.12,
    wastePct: null,
    targetPct: 10,
  });
  assert.match(line, /\$100\.00\+ sales/);
});

test('describeWasteFormulaBreakdown when ratio is official', () => {
  const line = describeWasteFormulaBreakdown({
    discard: 50,
    scrap: 50,
    sales: 10_000,
    wastePct: 1,
    targetPct: 10,
  });
  assert.match(line, /=\s1\.00%/);
});
