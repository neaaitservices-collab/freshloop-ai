import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claimManufacturingOperationId,
  manufacturingOperationStorageKey,
  purgeUnscopedManufacturingOperationKeys,
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
    keys: () => [...rows.keys()],
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

test('account switch, logout, and reload keep only the signed-in user retry', () => {
  const store = memoryStore();
  const payload = '{"recipe_id":"soup"}';
  let n = 0;
  const createId = () => `id-${++n}`;

  store.set(payload, 'legacy-unscoped');
  assert.equal(manufacturingOperationStorageKey('  ', payload), null);
  assert.equal(manufacturingOperationStorageKey('', payload), null);

  const removed = purgeUnscopedManufacturingOperationKeys(store.keys(), (key) => store.delete(key));
  assert.equal(removed, 1);
  assert.equal(store.get(payload), null);

  const keyA = manufacturingOperationStorageKey('staff-a', payload);
  const keyB = manufacturingOperationStorageKey('staff-b', payload);
  assert.ok(keyA && keyB && keyA !== keyB);

  const firstA = claimManufacturingOperationId(store, keyA, createId);
  const retryA = claimManufacturingOperationId(store, keyA, createId);
  assert.equal(firstA, 'id-1');
  assert.equal(retryA, 'id-1');

  const firstB = claimManufacturingOperationId(store, keyB, createId);
  assert.equal(firstB, 'id-2');
  assert.notEqual(firstB, firstA);
  assert.equal(store.get(keyA), 'id-1');

  const afterLogout = claimManufacturingOperationId(store, keyA, createId);
  assert.equal(afterLogout, 'id-1');

  settleManufacturingOperationId(store, keyA);
  assert.equal(store.get(keyA), null);
  assert.equal(store.get(keyB), 'id-2');
  const nextA = claimManufacturingOperationId(store, keyA, createId);
  assert.equal(nextA, 'id-3');
});
