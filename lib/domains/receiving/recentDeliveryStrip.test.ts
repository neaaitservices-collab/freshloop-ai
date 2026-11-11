import assert from 'node:assert/strict';
import test from 'node:test';
import { recentDeliveryStripItems } from '@/lib/domains/receiving/recentDeliveryStrip';

test('the recent deliveries strip is only the open invoice and does not drop history', () => {
  const logs = [
    { id: 'line-1', itemName: 'Cookies', invoiceNumber: '10303' },
    { id: 'line-2', itemName: 'Biscotti', invoiceNumber: '10303' },
    { id: 'line-9', itemName: 'Apples', invoiceNumber: '10001' },
    { id: 'posted-1', itemName: 'Milk' },
    { id: 'posted-2', itemName: 'Bread', invoiceNumber: '  ' },
  ];
  const before = logs.map((row) => ({ ...row }));

  assert.deepEqual(
    recentDeliveryStripItems(logs, new Set(['line-1', 'line-2'])).map((row) => row.id),
    ['line-1', 'line-2']
  );
  assert.deepEqual(
    recentDeliveryStripItems(logs, new Set(['line-1'])).map((row) => row.id),
    ['line-1', 'line-2']
  );
  assert.deepEqual(recentDeliveryStripItems(logs, new Set()), []);
  assert.deepEqual(recentDeliveryStripItems(logs, new Set(['missing'])), []);
  assert.deepEqual(logs, before);
});
