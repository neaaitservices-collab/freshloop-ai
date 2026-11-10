import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COST_WASTE_TOTAL_DETAIL,
  COST_WASTE_TOTAL_LABEL,
  RETAIL_VALUE_LOST_DETAIL,
  RETAIL_VALUE_LOST_LABEL,
} from '@/lib/domains/stats/wasteDollarLabels';

test('value lost and total waste name different dollar bases', () => {
  assert.match(RETAIL_VALUE_LOST_LABEL, /Value lost/);
  assert.match(RETAIL_VALUE_LOST_DETAIL, /Shelf price/);
  assert.match(RETAIL_VALUE_LOST_DETAIL, /Excludes kitchen scrap/);
  assert.match(COST_WASTE_TOTAL_LABEL, /at cost/);
  assert.match(COST_WASTE_TOTAL_DETAIL, /unit cost/);
  assert.match(COST_WASTE_TOTAL_DETAIL, /kitchen scrap/);
  assert.match(COST_WASTE_TOTAL_DETAIL, /Not the shelf-price/);
  assert.notEqual(RETAIL_VALUE_LOST_DETAIL, COST_WASTE_TOTAL_DETAIL);
});
