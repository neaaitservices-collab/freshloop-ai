import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyBuyForecastToLevel,
  averageWindowMultiplier,
  buildForecastRationale,
  computeBuyForecastLine,
  dailyVelocityUnits,
  projectedDemandUnits,
  suggestDynamicParCases,
  DEFAULT_DOW_MULTIPLIERS,
} from '@/lib/domains/inventory/forecasting';
import type { StockLevel } from '@/lib/domains/inventory/stock';

function baseRow(overrides: Partial<StockLevel> = {}): StockLevel {
  return {
    productId: 'p1',
    name: 'Apples',
    supplier: 'Farm Co',
    department: 'PRODUCE',
    category: 'PRODUCE',
    productType: 'lb',
    origin: null,
    unitType: 'lb',
    casePackSize: 10,
    receivePackSize: 10,
    splitFactor: 1,
    unitCost: 1.5,
    onHand: 5,
    kitchenPrepQty: 0,
    parUnits: 20,
    onHandCases: 0.5,
    parCases: 2,
    orderCases: 2,
    orderCost: 30,
    low: true,
    receiveCaseCost: null,
    pullSensitivityDays: null,
    pullDays: 3,
    caseRetailPrice: null,
    retailPrice: 2.5,
    regularRetailPrice: 2.5,
    isMarkdown: false,
    daysRemaining: 5,
    posSoldInWindow: 70,
    posSalesDays: 7,
    ...overrides,
  };
}

test('dailyVelocityUnits averages POS window', () => {
  assert.equal(dailyVelocityUnits(70, 7), 10);
  assert.equal(dailyVelocityUnits(0, 7), 0);
});

test('projectedDemandUnits scales with lead and DOW', () => {
  const start = new Date('2026-03-02T12:00:00'); // Monday
  const units = projectedDemandUnits({
    dailyVelocity: 10,
    leadTimeDays: 2,
    safetyStockDays: 0,
    startDate: start,
    dayOfWeekMultipliers: DEFAULT_DOW_MULTIPLIERS,
  });
  assert.ok(units > 18 && units < 21);
});

test('suggestDynamicParCases respects pack size', () => {
  const suggested = suggestDynamicParCases({
    dailyVelocity: 10,
    casePackSize: 12,
    parCoverageDays: 7,
    currentParCases: 2,
  });
  assert.ok(suggested);
  assert.equal(suggested, 6);
});

test('computeBuyForecastLine falls back without velocity', () => {
  const row = baseRow({ posSoldInWindow: 0 });
  const line = computeBuyForecastLine(row, {
    velocityLookbackDays: 7,
    leadTimeDays: 2,
    safetyStockDays: 1,
    parCoverageDays: 7,
    hooks: {},
  });
  assert.equal(line.forecastDriven, false);
  assert.equal(line.forecastRationale, '');
});

test('computeBuyForecastLine increases order vs static par alone', () => {
  const row = baseRow({ onHand: 18, parCases: 2, posSoldInWindow: 84 });
  const line = computeBuyForecastLine(row, {
    velocityLookbackDays: 7,
    leadTimeDays: 2,
    safetyStockDays: 1,
    parCoverageDays: 7,
    hooks: { seasonalFactor: 1 },
  });
  assert.ok(line.forecastRationale.includes('7-day velocity'));
  assert.ok(line.orderCases >= 1);
  assert.equal(line.forecastDriven, true);
});

test('applyBuyForecastToLevel attaches rationale fields', () => {
  const row = baseRow();
  const next = applyBuyForecastToLevel(row);
  assert.ok(next.forecastRationale);
  assert.ok(next.forecastDailyVelocity && next.forecastDailyVelocity > 0);
});

test('buildForecastRationale mentions weekend multiplier when boosted', () => {
  const text = buildForecastRationale({
    lookbackDays: 7,
    dailyVelocity: 12,
    leadTimeDays: 2,
    windowMultiplier: 1.12,
    usedWeekendBoost: true,
  });
  assert.ok(text.includes('weekend multiplier'));
});

test('averageWindowMultiplier near 1 for flat profile', () => {
  const flat = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
  const avg = averageWindowMultiplier(new Date('2026-01-01'), 7, flat);
  assert.equal(avg, 1);
});
