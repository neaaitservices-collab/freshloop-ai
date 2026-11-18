import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDraftLinesCommittable } from '@/lib/domains/receiving/invoiceOcrCommit';
import { validateReceivingLogPostInput } from '@/lib/domains/receiving/receivingLogPost';
import { clientIpKey } from '@/lib/security/rateLimit';

const baseLine = {
  itemName: 'Apples',
  casesReceived: 2,
  caseCost: 10,
  packSize: 12,
  splitFactor: 1,
  retailUnit: 'lbs' as const,
  marginMode: '40' as const,
  currentRetailPrice: 1.5,
  externalLogId: '33333333-3333-4333-8333-333333333333',
};

test('receiving rejects a blank case cost and retail price', () => {
  const blankCost = validateReceivingLogPostInput({ ...baseLine, caseCost: '' });
  assert.equal(blankCost.ok, false);
  const blankRetail = validateReceivingLogPostInput({ ...baseLine, currentRetailPrice: ' ' });
  assert.equal(blankRetail.ok, false);
  const zeroCost = validateReceivingLogPostInput({ ...baseLine, caseCost: 0 });
  assert.equal(zeroCost.ok, true);
  const numericString = validateReceivingLogPostInput({
    ...baseLine,
    caseCost: '10.5',
    currentRetailPrice: '1.5',
  });
  assert.equal(numericString.ok, true);
  if (numericString.ok) {
    assert.equal(numericString.input.caseCost, 10.5);
    assert.equal(numericString.input.currentRetailPrice, 1.5);
  }
});

test('receiving rejects a negative case cost and an unbounded quantity', () => {
  const negative = validateReceivingLogPostInput({ ...baseLine, caseCost: -1 });
  assert.equal(negative.ok, false);
  const huge = validateReceivingLogPostInput({ ...baseLine, casesReceived: 1_000_001 });
  assert.equal(huge.ok, false);
  const ok = validateReceivingLogPostInput(baseLine);
  assert.equal(ok.ok, true);
});

test('invoice commit blocks client-flagged guardrail lines unless a manager overrides', () => {
  const line = {
    product_id: 'sku',
    quantity: 1,
    unit_cost: 99,
    line_confidence: 0.99,
    requires_approval: true,
  };
  assert.throws(() => assertDraftLinesCommittable([line], false, true));
  assert.throws(() => assertDraftLinesCommittable([line], true, false));
  assert.doesNotThrow(() => assertDraftLinesCommittable([line], true, true));
});

test('client IP key uses the last forwarded hop', () => {
  const req = new Request('http://localhost/api/auth/forgot-password', {
    headers: { 'x-forwarded-for': '1.1.1.1, 10.0.0.8' },
  });
  assert.equal(clientIpKey(req), '10.0.0.8');
});
