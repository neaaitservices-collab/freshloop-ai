import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPriceVarianceDraft,
  computeCostVariancePct,
  isPriceVarianceAlert,
} from '@/lib/domains/suppliers/priceVariance';

test('computeCostVariancePct handles benchmark guard', () => {
  assert.equal(computeCostVariancePct(10, 0), null);
  assert.equal(computeCostVariancePct(110, 100), 10);
  assert.equal(computeCostVariancePct(95, 100), -5);
});

test('isPriceVarianceAlert uses absolute threshold', () => {
  assert.equal(isPriceVarianceAlert(6, 5), true);
  assert.equal(isPriceVarianceAlert(-6, 5), true);
  assert.equal(isPriceVarianceAlert(4, 5), false);
});

test('buildPriceVarianceDraft skips non-alerts', () => {
  assert.equal(
    buildPriceVarianceDraft({
      supplierId: 's1',
      productId: null,
      itemName: 'Apples',
      scannedUnitCost: 10,
      benchmarkCost: 10,
      thresholdPct: 5,
    }),
    null
  );
  const draft = buildPriceVarianceDraft({
    supplierId: 's1',
    productId: 'p1',
    itemName: 'Apples',
    scannedUnitCost: 12,
    benchmarkCost: 10,
    thresholdPct: 5,
  });
  assert.ok(draft);
  assert.equal(draft?.variancePct, 20);
});
