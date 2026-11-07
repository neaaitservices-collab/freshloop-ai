import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldQueueOffline } from '@/lib/offline/queue';

test('shouldQueueOffline detects fetch network TypeError', () => {
  assert.equal(shouldQueueOffline(new TypeError('Failed to fetch')), true);
});
