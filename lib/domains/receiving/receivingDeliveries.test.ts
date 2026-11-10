import assert from 'node:assert/strict';
import test from 'node:test';
import { receivingDeliveryToLog } from '@/lib/domains/receiving/receivingDeliveries';

test('a posted delivery becomes a receive-board row', () => {
  const log = receivingDeliveryToLog({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    itemName: 'Hass Avocados',
    casesReceived: 4,
    caseCost: 84.5,
    packSize: 12,
    productId: null,
    catalogProductId: 'prod-1',
  });
  assert.equal(log.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(log.itemName, 'Hass Avocados');
  assert.equal(log.casesReceived, 4);
  assert.equal(log.caseCost, 84.5);
  assert.equal(log.packSize, 12);
  assert.equal(log.productId, 'prod-1');
  assert.equal(log.canPost, true);
});

test('a delivery with no pack size omits pack size', () => {
  const log = receivingDeliveryToLog({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    itemName: 'Tomatoes',
    casesReceived: 1,
    caseCost: 10,
    packSize: 0,
    productId: '  ',
    catalogProductId: null,
  });
  assert.equal(log.packSize, undefined);
  assert.equal(log.productId, undefined);
});
