import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePosSalesDaysParam, posSalesWindowStart } from '@/lib/domains/inventory/posSalesUnits';

test('parsePosSalesDaysParam clamps and defaults', () => {
  assert.equal(parsePosSalesDaysParam(null, 7), 7);
  assert.equal(parsePosSalesDaysParam('3', 7), 3);
  assert.equal(parsePosSalesDaysParam('999', 7), 90);
});

test('posSalesWindowStart spans lookback days inclusive', () => {
  const start = posSalesWindowStart(3);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expected = new Date(today);
  expected.setDate(expected.getDate() - 2);
  assert.equal(start.getTime(), expected.getTime());
});
