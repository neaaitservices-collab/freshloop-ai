import assert from 'node:assert/strict';
import test from 'node:test';
import { sumInboxByProduct } from '@/lib/domains/inventory/inboxReceipts';

test('multiple transfers of one product sum, and the newest sender is kept', () => {
  const rows = [
    {
      productId: 'bread',
      qtyReceived: 4,
      lastReceivedAt: '2026-11-10T15:00:00.000Z',
      staffName: 'Ada',
    },
    {
      productId: 'bread',
      qtyReceived: 1.5,
      lastReceivedAt: '2026-11-10T09:00:00.000Z',
      staffName: 'Bea',
    },
    {
      productId: 'milk',
      qtyReceived: 2,
      lastReceivedAt: '2026-11-10T12:00:00.000Z',
      staffName: 'Cy',
    },
  ];

  const newestFirst = sumInboxByProduct(rows);
  const oldestFirst = sumInboxByProduct([...rows].reverse());

  for (const totals of [newestFirst, oldestFirst]) {
    const bread = totals.find((row) => row.productId === 'bread');
    const milk = totals.find((row) => row.productId === 'milk');
    assert.equal(bread?.qtyReceived, 5.5);
    assert.equal(bread?.lastReceivedAt, '2026-11-10T15:00:00.000Z');
    assert.equal(bread?.staffName, 'Ada');
    assert.equal(milk?.qtyReceived, 2);
    assert.equal(milk?.staffName, 'Cy');
  }
});
