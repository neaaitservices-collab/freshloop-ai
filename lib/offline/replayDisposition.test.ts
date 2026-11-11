import assert from 'node:assert/strict';
import test from 'node:test';
import { offlineReplayDisposition } from '@/lib/offline/replayDisposition';

test('offline replay drops only permanent client statuses', () => {
  for (const status of [400, 403, 404, 409, 422]) {
    assert.equal(offlineReplayDisposition(status), 'drop', String(status));
  }
  for (const status of [401, 408, 429, 500, 502, 503, 504]) {
    assert.equal(offlineReplayDisposition(status), 'retry', String(status));
  }
});
