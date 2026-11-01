import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownRevenueImpact, multiplyMoney, toCents } from '@/lib/utils/money';

test('toCents rounds half-up', () => {
  assert.equal(toCents(3.455), 346);
});

test('multiplyMoney avoids float drift', () => {
  assert.equal(multiplyMoney(2.99, 3), 8.97);
});

test('markdownRevenueImpact uses regular minus markdown', () => {
  assert.equal(markdownRevenueImpact(10, 4.99, 3.49), 15);
});
