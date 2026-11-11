import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  canActOnReceivingStripLine,
  openReceivingLine,
  recentDeliveryStripItems,
  savedDeliveryChoices,
} from '@/lib/domains/receiving/recentDeliveryStrip';

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

test('two suppliers sharing an invoice number stay on their own strip', () => {
  const logs = [
    { id: 'a1', itemName: 'Cookies', invoiceNumber: '10303', supplierId: 'sup-a' },
    { id: 'a2', itemName: 'Biscotti', invoiceNumber: '10303', supplierId: 'sup-a' },
    { id: 'b1', itemName: 'Bread', invoiceNumber: '10303', supplierId: 'sup-b' },
    { id: 'old', itemName: 'RED ONION JUMBO', invoiceNumber: '10001', supplierId: 'sup-b' },
  ];
  const active = new Set(['a1']);
  const before = logs.map((row) => ({ ...row }));

  assert.deepEqual(
    recentDeliveryStripItems(logs, active).map((row) => row.id),
    ['a1', 'a2']
  );
  assert.equal(canActOnReceivingStripLine(logs[2], logs, active), false);
  const opened = openReceivingLine('b1', logs, active);
  assert.notEqual(opened?.id, 'b1');
  assert.equal(opened?.id, 'a1');
  assert.equal(openReceivingLine('old', logs, active)?.id, 'a1');
  assert.equal(canActOnReceivingStripLine(logs[3], logs, active), false);
  assert.deepEqual(logs, before);
});

test('supplier id wins when two suppliers share a printed name and invoice number', () => {
  const logs = [
    { id: 'a1', itemName: 'Cookies', invoiceNumber: '10303', supplierId: 'sup-a', supplierName: 'Shared Foods' },
    { id: 'b1', itemName: 'Bread', invoiceNumber: '10303', supplierId: 'sup-b', supplierName: 'Shared Foods' },
  ];
  const active = new Set(['a1']);
  assert.deepEqual(recentDeliveryStripItems(logs, active).map((row) => row.id), ['a1']);
  assert.equal(canActOnReceivingStripLine(logs[1], logs, active), false);
  assert.notEqual(openReceivingLine('b1', logs, active)?.id, 'b1');
});

test('supplier name matches an invoice when no supplier id is stored', () => {
  const logs = [
    { id: 'a1', itemName: 'Cookies', invoiceNumber: '10303', supplierName: 'Acme Foods' },
    { id: 'a2', itemName: 'Biscotti', invoiceNumber: '10303', vendorName: 'acme foods' },
    { id: 'b1', itemName: 'Bread', invoiceNumber: '10303', supplierName: 'Beta Produce' },
  ];
  const active = new Set(['a1']);
  assert.deepEqual(recentDeliveryStripItems(logs, active).map((row) => row.id), ['a1', 'a2']);
  assert.equal(canActOnReceivingStripLine(logs[2], logs, active), false);
});

test('the open invoice supplier id excludes another supplier that reused the number', () => {
  const logs = [
    { id: 'a1', itemName: 'Cookies', invoiceNumber: '10303' },
    { id: 'b1', itemName: 'Bread', invoiceNumber: '10303', supplierId: 'sup-b' },
  ];
  const active = new Set(['a1']);
  const supplier = { supplierId: 'sup-a', supplierName: 'Acme Foods' };
  assert.deepEqual(
    recentDeliveryStripItems(logs, active, supplier).map((row) => row.id),
    ['a1']
  );
  assert.equal(canActOnReceivingStripLine(logs[1], logs, active, supplier), false);
  assert.notEqual(openReceivingLine('b1', logs, active, supplier)?.id, 'b1');
});

test('the strip is empty when no invoice is active', () => {
  const logs = [
    { id: 'a1', itemName: 'Cookies', invoiceNumber: '10303', supplierId: 'sup-a' },
    { id: 'b1', itemName: 'Bread', invoiceNumber: '10303', supplierId: 'sup-b' },
  ];
  assert.deepEqual(recentDeliveryStripItems(logs, new Set()), []);
  assert.equal(canActOnReceivingStripLine(logs[0], logs, new Set()), false);
  assert.equal(canActOnReceivingStripLine(logs[1], logs, new Set()), false);
  assert.equal(openReceivingLine('b1', logs, new Set()), null);
});

test('saved deliveries list only the active supplier invoice and keep history', () => {
  const logs = [
    { id: 'a1', itemName: 'Cookies', invoiceNumber: '10303', supplierId: 'sup-a' },
    { id: 'a2', itemName: 'Biscotti', invoiceNumber: '10303', supplierId: 'sup-a' },
    { id: 'b1', itemName: 'Bread', invoiceNumber: '10303', supplierId: 'sup-b' },
    { id: 'onion', itemName: 'RED ONION JUMBO' },
    { id: 'milk', itemName: 'Milk', invoiceNumber: '10001', supplierId: 'sup-a' },
  ];
  const before = logs.map((row) => ({ ...row }));
  const choices = savedDeliveryChoices(logs, new Set(['a1']));

  assert.deepEqual(choices.map((row) => row.id), ['a1', 'a2']);
  assert.equal(choices.some((row) => row.id === 'b1' || row.id === 'onion' || row.id === 'milk'), false);
  assert.equal(openReceivingLine('onion', logs, new Set(['a1']))?.id, 'a1');
  assert.equal(canActOnReceivingStripLine(logs[2], logs, new Set(['a1'])), false);
  assert.deepEqual(logs, before);
  assert.equal(logs.length, 5);
});

test('saved deliveries are empty and nothing is preselected when no invoice is active', () => {
  const logs = [
    { id: 'onion', itemName: 'RED ONION JUMBO' },
    { id: 'milk', itemName: 'Milk', invoiceNumber: '10001', supplierId: 'sup-a' },
    { id: 'a1', itemName: 'Cookies', invoiceNumber: '10303', supplierId: 'sup-a' },
  ];
  const before = logs.map((row) => ({ ...row }));

  assert.deepEqual(savedDeliveryChoices(logs, new Set()), []);
  assert.equal(openReceivingLine('onion', logs, new Set()), null);
  assert.equal(openReceivingLine(null, logs, new Set()), null);
  assert.equal(canActOnReceivingStripLine(logs[0], logs, new Set()), false);
  assert.deepEqual(logs, before);
});

test('the receive screen scopes the saved deliveries dropdown and does not preselect history', () => {
  const dashboard = fs.readFileSync(
    path.join(process.cwd(), 'components/features/receive/YieldPricingDashboard.tsx'),
    'utf8'
  );
  assert.match(dashboard, /savedDeliveryChoices\(/);
  assert.match(dashboard, /openReceivingLine\(/);
  assert.match(dashboard, /canActOnReceivingStripLine\(/);
  assert.match(dashboard, /Saved deliveries/);
  assert.doesNotMatch(dashboard, /listLogs\.map/);
  assert.doesNotMatch(dashboard, /openLogs\[0\]/);
  assert.doesNotMatch(dashboard, /listLogs\[0\]/);
  assert.doesNotMatch(dashboard, /initialLogs\?\.\[0\]/);
  assert.doesNotMatch(dashboard, /nextLogs\[0\]/);
});
