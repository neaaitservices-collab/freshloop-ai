import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RECEIVING_DELIVERIES_UNAVAILABLE,
  RECEIVING_DELIVERY_LIST_LIMIT,
  listReceivingDeliveryLogs,
  receivingDeliveryToLog,
} from '@/lib/domains/receiving/receivingDeliveries';

const POSTED = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  itemName: 'Hass Avocados',
  casesReceived: 4,
  caseCost: 84.5,
  packSize: 12,
  productId: null,
  catalogProductId: 'prod-1',
};

test('empty receiving list means nothing has been posted', async () => {
  let seenLimit = 0;
  const result = await listReceivingDeliveryLogs({
    findDeliveries: async (limit) => {
      seenLimit = limit;
      return [];
    },
  });
  assert.equal(seenLimit, RECEIVING_DELIVERY_LIST_LIMIT);
  assert.equal(result.success, true);
  assert.deepEqual(result.logs, []);
  assert.equal(result.warning, null);
});

test('a database failure is a warning, not a throw', async () => {
  const result = await listReceivingDeliveryLogs({
    findDeliveries: async () => {
      const error = new Error('relation "receiving_deliveries" does not exist') as Error & {
        code?: string;
      };
      error.code = 'P2021';
      throw error;
    },
  });
  assert.equal(result.success, false);
  assert.deepEqual(result.logs, []);
  assert.equal(result.warning, RECEIVING_DELIVERIES_UNAVAILABLE);
});

test('a posted delivery is listed read-only', async () => {
  const result = await listReceivingDeliveryLogs({
    findDeliveries: async () => [POSTED],
  });
  assert.equal(result.success, true);
  assert.equal(result.logs.length, 1);
  assert.equal(result.logs[0]?.canPost, false);
  assert.equal(result.logs[0]?.id, POSTED.id);
  assert.equal(result.logs[0]?.itemName, POSTED.itemName);
  assert.equal(result.logs[0]?.casesReceived, 4);
  assert.equal(result.logs[0]?.caseCost, 84.5);
  assert.equal(result.logs[0]?.productId, 'prod-1');
});

test('receivingDeliveryToLog does not offer a posted row for save', () => {
  const log = receivingDeliveryToLog({ ...POSTED, packSize: 0, catalogProductId: null, productId: '  ' });
  assert.equal(log.canPost, false);
  assert.equal(log.packSize, undefined);
  assert.equal(log.productId, undefined);
});
