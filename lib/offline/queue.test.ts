import assert from 'node:assert/strict';
import test from 'node:test';
import { selectFlushableMutations, shouldQueueOffline } from '@/lib/offline/queue';

test('shouldQueueOffline detects fetch network TypeError', () => {
  assert.equal(shouldQueueOffline(new TypeError('Failed to fetch')), true);
});

test('a write stays queued after more than 5 failures', () => {
  const queued = selectFlushableMutations([
    { status: 'failed', attempts: 6, createdAt: 2 },
    { status: 'failed', attempts: 9, createdAt: 1 },
    { status: 'synced', attempts: 1, createdAt: 3 },
  ]);
  assert.deepEqual(
    queued.map((row) => row.attempts),
    [9, 6]
  );
});
