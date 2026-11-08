import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claimManufacturingOperationId,
  settleManufacturingOperationId,
  type ManufacturingOperationStore,
} from '@/lib/domains/manufacturing/operationAttempt';

function memoryStore(): ManufacturingOperationStore & { size(): number } {
  const rows = new Map<string, string>();
  return {
    get: (key) => rows.get(key) ?? null,
    set: (key, value) => {
      rows.set(key, value);
    },
    delete: (key) => {
      rows.delete(key);
    },
    size: () => rows.size,
  };
}

test('caller reuses an operation id until the attempt is settled', () => {
  const store = memoryStore();
  let n = 0;
  const createId = () => `id-${++n}`;
  const first = claimManufacturingOperationId(store, 'payload-a', createId);
  const retry = claimManufacturingOperationId(store, 'payload-a', createId);
  assert.equal(first, 'id-1');
  assert.equal(retry, 'id-1');
  assert.equal(n, 1);

  const otherPayload = claimManufacturingOperationId(store, 'payload-b', createId);
  assert.equal(otherPayload, 'id-2');

  settleManufacturingOperationId(store, 'payload-a');
  const nextBatch = claimManufacturingOperationId(store, 'payload-a', createId);
  assert.equal(nextBatch, 'id-3');
  assert.equal(store.size(), 2);
});
