import test from 'node:test';
import assert from 'node:assert/strict';
import {
  caseFloorForTargetMargin,
  floorPriceForTargetMargin,
  resolvePricingEconomics,
  unitFloorPriceForMarginPreset,
} from '@/lib/domains/receiving/yieldPricing';

test('resolvePricingEconomics: per-unit standardCost (receive path)', () => {
  const econ = resolvePricingEconomics({
    standardCost: 2.175,
    packSize: 40,
    splitFactor: 1,
  });
  assert.equal(econ.caseCost, 87);
  assert.ok(Math.abs(econ.unitCostPerSellable - 2.175) < 0.001);
});

test('resolvePricingEconomics: legacy case cost stored in standardCost', () => {
  const econ = resolvePricingEconomics({
    standardCost: 87,
    packSize: 40,
    splitFactor: 1,
  });
  assert.equal(econ.caseCost, 87);
  assert.ok(Math.abs(econ.unitCostPerSellable - 2.175) < 0.001);
});

test('unitFloorPriceForMarginPreset: explicit /0.65 and /0.60 divisors', () => {
  assert.equal(unitFloorPriceForMarginPreset(2.1, '40'), 3.5);
  assert.ok(Math.abs((unitFloorPriceForMarginPreset(2.1, '35') ?? 0) - 3.23) < 0.01);
});

test('floor price: case cost ÷ pack, then 40% margin (green beans)', () => {
  const econ = resolvePricingEconomics({
    standardCost: 87,
    packSize: 40,
    splitFactor: 1,
  });
  const perLb = floorPriceForTargetMargin({
    caseCost: econ.caseCost,
    packSize: 40,
    splitFactor: 1,
    marginMode: '40',
    customMarginPercent: 0,
  });
  assert.ok(perLb !== null);
  assert.ok(Math.abs(perLb - 3.625) < 0.02);
  const caseFloor = caseFloorForTargetMargin({ caseCost: econ.caseCost, marginMode: '40' });
  assert.ok(caseFloor !== null);
  assert.ok(Math.abs(caseFloor - 145) < 0.5);
});
