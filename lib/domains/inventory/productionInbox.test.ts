import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  PRODUCTION_INBOX_EMPTY,
  PRODUCTION_INBOX_TITLE,
  productionInboxQuery,
} from '@/lib/domains/inventory/productionInboxQuery';
import { IN_STOCK_LEVELS_PATH } from '@/lib/domains/inventory/levelsResponse';
import { formatTorontoDateTime, presetRange, torontoToday } from '@/lib/domains/stats/storeTime';

function search(values: Record<string, string | null>) {
  return {
    get(name: string) {
      return values[name] ?? null;
    },
  };
}

test('production inbox defaults to Today and applies Week or a custom range', () => {
  assert.equal(productionInboxQuery(search({})), 'preset=day');
  const today = presetRange('day');
  assert.equal(today.from, torontoToday());
  assert.equal(today.to, torontoToday());
  assert.equal(productionInboxQuery(search({ preset: 'week' })), 'preset=week');
  assert.equal(
    productionInboxQuery(search({ from: '2026-03-01', to: '2026-03-08' })),
    'from=2026-03-01&to=2026-03-08'
  );
});

test('an empty From floor inbox has its own copy and a Toronto timestamp', () => {
  assert.equal(PRODUCTION_INBOX_TITLE, 'From floor');
  assert.equal(PRODUCTION_INBOX_EMPTY, 'Nothing came from the floor in this range.');
  assert.match(PRODUCTION_INBOX_TITLE, /^(?!.*rescue).*$/i);
  const when = formatTorontoDateTime('2026-03-08T15:30:00.000Z');
  assert.match(when, /Mar/);
  assert.match(when, /\d/);
});

test('live prep on-hand does not take the production date filter', () => {
  assert.equal(IN_STOCK_LEVELS_PATH.includes('preset'), false);
  assert.equal(IN_STOCK_LEVELS_PATH.includes('from='), false);
  assert.equal(IN_STOCK_LEVELS_PATH.includes('to='), false);
  const source = fs.readFileSync(
    path.join(process.cwd(), 'components/features/production/ProductionFloorTransfersSection.tsx'),
    'utf8'
  );
  const inboxAt = source.indexOf('<KitchenFloorInbox');
  const prepAt = source.indexOf('<LiveSubInventoryTransfers');
  assert.ok(inboxAt >= 0 && prepAt > inboxAt);
  const prepBlock = source.slice(prepAt);
  assert.equal(prepBlock.includes('preset'), false);
  assert.equal(prepBlock.includes('productionInboxQuery'), false);
  assert.match(source, /defaultPreset="day"/);
  const inbox = fs.readFileSync(
    path.join(process.cwd(), 'components/features/kitchen/KitchenFloorInbox.tsx'),
    'utf8'
  );
  assert.match(inbox, /item\.name/);
  assert.match(inbox, /item\.qtyReceived/);
  assert.match(inbox, /staffName/);
  assert.match(inbox, /formatTorontoDateTime\(item\.lastReceivedAt\)/);
  assert.match(inbox, /PRODUCTION_INBOX_EMPTY/);
  assert.doesNotMatch(inbox, /rescue/i);
});
