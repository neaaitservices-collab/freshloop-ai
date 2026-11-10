import assert from 'node:assert/strict';
import test from 'node:test';
import {
  belowParSkus,
  forecastApprovalLines,
  listedForecastLines,
  outOfStockSkus,
  stockAlertCounts,
} from '@/lib/domains/inventory/lowStock';
import { DEFAULT_PAR_CASES, resolveParCases, stockFromPar } from '@/lib/domains/inventory/parLevel';

function rated(
  onHand: number,
  parCases: number | null,
  extra: { forecastDriven?: boolean; low?: boolean; hasStockHistory?: boolean } = {}
) {
  const par = resolveParCases(parCases, DEFAULT_PAR_CASES);
  const stock = stockFromPar({
    onHand,
    casePackSize: 1,
    unitCost: 1,
    parCases: par,
  });
  return {
    onHand: Number(onHand.toFixed(2)),
    parUnits: stock.parUnits,
    low: stock.low,
    hasStockHistory: true,
    ...extra,
  };
}

test('below par, at par, and an empty shelf stay in separate buckets', () => {
  const below = rated(1, 2);
  const atPar = rated(2, 2);
  const empty = rated(0, 2);
  const levels = [below, atPar, empty];

  assert.equal(belowParSkus(levels).length, 1);
  assert.equal(belowParSkus(levels)[0], below);
  assert.equal(outOfStockSkus(levels).length, 1);
  assert.equal(outOfStockSkus(levels)[0], empty);
  assert.deepEqual(stockAlertCounts(levels), {
    belowPar: 1,
    outOfStock: 1,
    forecastSuggested: 0,
  });
});

test('null and zero par use the store default before the below-par check', () => {
  assert.equal(resolveParCases(null, DEFAULT_PAR_CASES), DEFAULT_PAR_CASES);
  assert.equal(resolveParCases(0, DEFAULT_PAR_CASES), DEFAULT_PAR_CASES);
  const unset = rated(1, null);
  const zeroPar = rated(1, 0);
  assert.equal(unset.parUnits, DEFAULT_PAR_CASES);
  assert.equal(belowParSkus([unset, zeroPar]).length, 2);
  assert.equal(outOfStockSkus([unset, zeroPar]).length, 0);
});

test('never-stocked empty shelves are excluded and previously stocked ones are out of stock', () => {
  const neverStocked = rated(0, 4, { hasStockHistory: false });
  const previouslyStocked = rated(0, 4);
  assert.deepEqual(outOfStockSkus([neverStocked, previouslyStocked]), [previouslyStocked]);
});

test('forecast banner count matches the listed forecast lines', () => {
  const below = rated(1, 4);
  const atPar = rated(4, 4);
  const previouslyStocked = rated(0, 4);
  const forecastAbovePar = rated(8, 2, { forecastDriven: true, low: true });
  const forecastNotLow = rated(9, 2, { forecastDriven: true });
  const belowAndForecast = rated(1, 3, { forecastDriven: true, low: true });
  const levels = [below, atPar, previouslyStocked, forecastAbovePar, forecastNotLow, belowAndForecast];
  const listed = listedForecastLines(levels);
  const orders = stockAlertCounts(levels);
  assert.equal(belowParSkus(levels).length, orders.belowPar);
  assert.equal(orders.forecastSuggested, listed.length);
  assert.deepEqual(listed, [forecastAbovePar]);
  assert.equal(forecastNotLow.low, false);
  assert.equal(forecastNotLow.forecastDriven, true);
  assert.equal(orders.outOfStock, 1);
  assert.equal(orders.belowPar, 2);
});

test('bulk approve still includes below-par and out-of-stock forecast rows', () => {
  const belowParForecast = rated(1, 4, { forecastDriven: true, low: true });
  const outOfStockForecast = rated(0, 4, { forecastDriven: true, low: true });
  const bannerOnly = rated(8, 2, { forecastDriven: true, low: true });
  const forecastNotLow = rated(9, 2, { forecastDriven: true });
  const levels = [belowParForecast, outOfStockForecast, bannerOnly, forecastNotLow];
  const approved = forecastApprovalLines(levels);
  const banner = listedForecastLines(levels);
  assert.deepEqual(approved, [belowParForecast, outOfStockForecast, bannerOnly]);
  assert.deepEqual(banner, [bannerOnly]);
  assert.equal(stockAlertCounts(levels).forecastSuggested, banner.length);
  const sent = new Set([belowParForecast]);
  assert.deepEqual(
    forecastApprovalLines(levels, (row) => sent.has(row)),
    [outOfStockForecast, bannerOnly]
  );
});
