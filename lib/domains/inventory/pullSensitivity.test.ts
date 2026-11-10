import assert from 'node:assert/strict';
import test from 'node:test';
import { inShortDatedTransferQueue } from '@/lib/domains/inventory/pullSensitivity';

test('short-dated transfer queue matches the labeled pull window', () => {
  assert.equal(inShortDatedTransferQueue(3, 3), true);
  assert.equal(inShortDatedTransferQueue(4, 3), false);
  assert.equal(inShortDatedTransferQueue(0, 3), true);
});
