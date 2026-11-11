import assert from 'node:assert/strict';
import test from 'node:test';
import { offlineReplayDisposition } from '@/lib/offline/replayDisposition';

test('an expired invoice replay is dropped instead of retried', () => {
  assert.equal(offlineReplayDisposition(409), 'drop');
  assert.equal(offlineReplayDisposition(400), 'drop');
  assert.equal(offlineReplayDisposition(422), 'drop');
  assert.equal(offlineReplayDisposition(500), 'retry');
  assert.equal(offlineReplayDisposition(503), 'retry');
});
