import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PRICE_CHANGE_THRESHOLD_PCT,
  getPriceChangeThresholdPct,
  resolvePriceChangeThresholdPct,
} from '@/lib/domains/suppliers/priceChangeThreshold';

test('price change threshold falls back to 8 when nothing is stored', () => {
  assert.equal(DEFAULT_PRICE_CHANGE_THRESHOLD_PCT, 8);
  assert.equal(resolvePriceChangeThresholdPct(undefined), 8);
  assert.equal(resolvePriceChangeThresholdPct(null), 8);
  assert.equal(resolvePriceChangeThresholdPct(Number.NaN), 8);
  assert.equal(resolvePriceChangeThresholdPct(Number.POSITIVE_INFINITY), 8);
});

test('price change threshold returns the stored percent', () => {
  assert.equal(resolvePriceChangeThresholdPct(8), 8);
  assert.equal(resolvePriceChangeThresholdPct(12.5), 12.5);
  assert.equal(resolvePriceChangeThresholdPct(0), 0);
});

test('a missing price change column reads as 8', async () => {
  const value = await getPriceChangeThresholdPct(async () => {
    throw new Error('The column priceChangeThresholdPct does not exist in the current database.');
  });
  assert.equal(value, DEFAULT_PRICE_CHANGE_THRESHOLD_PCT);
});
