import assert from 'node:assert/strict';
import test from 'node:test';
import { offlineReferenceId, OFFLINE_REFERENCE_PREFIX } from '@/lib/domains/inventory/offlineMutation';

test('offlineReferenceId prefixes stable client ids', () => {
  const ref = offlineReferenceId('abc-123');
  assert.equal(ref, `${OFFLINE_REFERENCE_PREFIX}abc-123`);
});
