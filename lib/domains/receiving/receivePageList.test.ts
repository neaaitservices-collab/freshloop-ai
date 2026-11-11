import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { receivingLogRemainsVisible } from '@/lib/domains/receiving/receivingListVisibility';

const page = fs.readFileSync(path.join(process.cwd(), 'app/receive/page.tsx'), 'utf8');
const screen = fs.readFileSync(
  path.join(process.cwd(), 'components/features/receive/ReceiveScreen.tsx'),
  'utf8'
);
const dashboard = fs.readFileSync(
  path.join(process.cwd(), 'components/features/receive/YieldPricingDashboard.tsx'),
  'utf8'
);

test('receive page renders the posted delivery list inside the pricing screen', () => {
  assert.match(page, /listReceivingDeliveryLogs\(\)/);
  assert.match(page, /<ReceiveScreen initial=\{initial\} \/>/);
  assert.match(screen, /title="Price the delivery"/);
  assert.match(screen, /<YieldPricingDashboard/);
  assert.match(screen, /initialLogs=\{initial\.logs\}/);
  assert.match(screen, /initialWarning=\{initial\.warning\}/);
  assert.match(dashboard, /receivingLogRemainsVisible\(/);
  assert.match(dashboard, /recentDeliveryStripItems\(/);
  assert.match(dashboard, /items=\{stripItems\}/);
  assert.match(dashboard, /Saved deliveries/);
  assert.match(dashboard, /initialLogs/);
});

test('a posted delivery stays listed after this tab has saved it', () => {
  const postedIds = new Set(['delivery-1']);
  const hiddenIds = new Set<string>();
  const invoiceIds = new Set<string>();
  assert.equal(
    receivingLogRemainsVisible(
      { id: 'delivery-1', canPost: false },
      { postedIds, hiddenIds, invoiceIds }
    ),
    true
  );
});

test('session hide still drops an invoice line that was just saved', () => {
  const postedIds = new Set(['line-1']);
  const hiddenIds = new Set<string>();
  const invoiceIds = new Set(['line-1']);
  assert.equal(
    receivingLogRemainsVisible(
      { id: 'line-1', canPost: true },
      { postedIds, hiddenIds, invoiceIds }
    ),
    false
  );
  assert.equal(
    receivingLogRemainsVisible(
      { id: 'line-2', canPost: false },
      { postedIds, hiddenIds, invoiceIds: new Set(['line-2']) }
    ),
    true
  );
});

test('a removed delivery stays off the list', () => {
  assert.equal(
    receivingLogRemainsVisible(
      { id: 'delivery-1', canPost: false },
      {
        postedIds: new Set(),
        hiddenIds: new Set(['delivery-1']),
        invoiceIds: new Set(),
      }
    ),
    false
  );
});
