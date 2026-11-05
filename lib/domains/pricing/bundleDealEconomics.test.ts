import assert from 'node:assert/strict';
import test from 'node:test';
import { computeBundleDealEconomics } from '@/lib/domains/pricing/bundleDealEconomics';

test('computeBundleDealEconomics margin from COGS', () => {
  const econ = computeBundleDealEconomics({
    minUnits: 2,
    bundlePrice: 10,
    unitCost: 3,
    regularUnitPrice: 6,
  });
  assert.equal(econ.cogsTotal, 6);
  assert.equal(econ.marginPct, 40);
  assert.equal(econ.regularTotal, 12);
  assert.equal(econ.savingsVsRegular, 2);
  assert.equal(econ.effectiveUnitPrice, 5);
});

test('computeBundleDealEconomics flags loss margin', () => {
  const econ = computeBundleDealEconomics({
    minUnits: 3,
    bundlePrice: 5,
    unitCost: 2,
  });
  assert.equal(econ.marginTone, 'loss');
});

test('computeBundleDealEconomics flags thin margin below alert threshold', () => {
  const econ = computeBundleDealEconomics({
    minUnits: 2,
    bundlePrice: 10,
    unitCost: 4.3,
  });
  assert.equal(econ.marginPct, 14);
  assert.equal(econ.marginTone, 'thin');
});
