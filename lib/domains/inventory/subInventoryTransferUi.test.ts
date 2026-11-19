import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoleProvider } from '@/components/auth/RoleProvider';
import {
  FloorWasteConfirm,
  SubInventoryTransferBar,
  floorWasteConfirmDetails,
  parseTransferQty,
  requestFloorWasteAction,
} from '@/components/features/inventory/SubInventoryTransferBar';
import { suggestedPullQty } from '@/components/features/inventory/SubInventoryTransferList';
import type { SubInventoryTransferRow } from '@/lib/domains/inventory/inventoryMoveClient';
import type { StockLevel } from '@/lib/domains/inventory/stock';

function level(partial: Partial<StockLevel> & Pick<StockLevel, 'productId'>): StockLevel {
  return {
    productId: partial.productId,
    name: partial.name ?? 'FARFALLE PASTA',
    supplier: 'Findlay',
    department: 'GROCERY',
    category: 'GROCERY',
    productType: 'RETAIL',
    origin: null,
    unitType: 'UNIT',
    casePackSize: 12,
    receivePackSize: 12,
    splitFactor: 1,
    unitCost: partial.unitCost ?? 2.8,
    onHand: partial.onHand ?? 0,
    kitchenPrepQty: partial.kitchenPrepQty ?? 0,
    parUnits: 0,
    onHandCases: 0,
    parCases: 0,
    orderCases: 0,
    orderCost: 0,
    low: partial.low ?? false,
    receiveCaseCost: null,
    pullSensitivityDays: null,
    pullDays: partial.pullDays ?? 3,
    caseRetailPrice: null,
    retailPrice: 4.69,
    regularRetailPrice: 4.69,
    isMarkdown: partial.isMarkdown ?? false,
    daysRemaining: partial.daysRemaining ?? 5,
  };
}

const pasta: SubInventoryTransferRow = {
  productId: 'pasta',
  name: 'FARFALLE PASTA',
  unitType: 'UNIT',
  onHand: 16,
  kitchenPrepQty: 0,
  unitCost: 2.8,
};

test('transfer qty defaults to 1 when the row is short-dated, low, or marked down', () => {
  for (const row of [
    level({ productId: 'short', onHand: 16, daysRemaining: 0, pullDays: 3 }),
    level({ productId: 'low', onHand: 16, low: true, daysRemaining: 9 }),
    level({ productId: 'mark', onHand: 16, isMarkdown: true, daysRemaining: 9 }),
    level({ productId: 'steady', onHand: 16, daysRemaining: 9 }),
  ]) {
    assert.equal(suggestedPullQty(row), 1, row.productId);
  }
  assert.equal(suggestedPullQty(level({ productId: 'empty', onHand: 0 })), 0);
  assert.equal(suggestedPullQty(level({ productId: 'partial', onHand: 0.4 })), 0.4);
});

test('a blank transfer qty is undefined and never 0', () => {
  for (const raw of ['', ' ', '0', '0.0', 'abc', '-1']) {
    const parsed = parseTransferQty(raw, 16, 1);
    assert.equal(parsed, undefined, raw);
    assert.notEqual(parsed, 0);
  }
  assert.equal(parseTransferQty('1', 16, 1), 1);
  assert.equal(parseTransferQty('1,5', 16, 0.25), 1.5);
  assert.equal(parseTransferQty('16', 16, 1), 16);
});

test('floor waste asks for confirmation and does not post', () => {
  assert.deepEqual(requestFloorWasteAction(1, false), { type: 'confirm', quantity: 1 });
  assert.deepEqual(requestFloorWasteAction(undefined, false), { type: 'blocked' });
  assert.deepEqual(requestFloorWasteAction(0, false), { type: 'blocked' });
  assert.deepEqual(requestFloorWasteAction(1, true), { type: 'blocked' });

  const known = floorWasteConfirmDetails({
    name: 'FARFALLE PASTA',
    quantity: 1,
    unit: 'units',
    unitCost: 2.8,
  });
  assert.equal(known.item, 'FARFALLE PASTA');
  assert.equal(known.quantityLabel, '1 units');
  assert.equal(known.location, 'Floor');
  assert.equal(known.costLabel, '$2.80');
  assert.equal(
    floorWasteConfirmDetails({ name: 'FARFALLE PASTA', quantity: 1, unit: 'units', unitCost: 0 })
      .costLabel,
    null
  );
  assert.equal(
    floorWasteConfirmDetails({ name: 'FARFALLE PASTA', quantity: 1, unit: 'units' }).costLabel,
    null
  );

  const html = renderToStaticMarkup(
    createElement(FloorWasteConfirm, {
      item: known.item,
      quantityLabel: known.quantityLabel,
      location: known.location,
      costLabel: known.costLabel,
      onCancel: () => {},
      onConfirm: () => {},
    })
  );
  assert.match(html, /role="alertdialog"/);
  assert.match(html, /FARFALLE PASTA/);
  assert.match(html, /1 units/);
  assert.match(html, />Floor</);
  assert.match(html, /\$2\.80/);
  assert.match(html, />Cancel</);
  assert.match(html, />Confirm waste</);
  assert.equal(/\bkitchen\b/i.test(html), false);

  const noCost = renderToStaticMarkup(
    createElement(FloorWasteConfirm, {
      item: 'FARFALLE PASTA',
      quantityLabel: '1 units',
      location: 'Floor',
      costLabel: null,
      onCancel: () => {},
      onConfirm: () => {},
    })
  );
  assert.equal(noCost.includes('Cost'), false);
  assert.equal(noCost.includes('$0.00'), false);
});

test('the transfer bar starts at 1, keeps All, and hides waste confirm until requested', () => {
  const row = level({
    productId: 'pasta',
    onHand: 16,
    low: true,
    isMarkdown: true,
    daysRemaining: 0,
  });
  const SessionShell = RoleProvider as ComponentType<{ session: null; children?: ReactNode }>;
  const html = renderToStaticMarkup(
    createElement(
      SessionShell,
      { session: null },
      createElement(SubInventoryTransferBar, {
        row: pasta,
        variant: 'floor',
        defaultQty: suggestedPullQty(row),
      })
    )
  );
  assert.match(html, /value="1"/);
  assert.equal(html.includes('value="16"'), false);
  assert.match(html, />All</);
  assert.match(html, /Floor waste/);
  assert.match(html, /To production/);
  assert.match(html, /Record sale/);
  assert.equal(html.includes('Confirm waste'), false);
  assert.equal(/\bkitchen\b/i.test(html), false);

  const source = readFileSync(
    'components/features/inventory/SubInventoryTransferBar.tsx',
    'utf8'
  );
  assert.equal((source.match(/onClick=\{requestFloorWaste\}/g) ?? []).length, 2);
  assert.equal((source.match(/run\('waste'/g) ?? []).length, 1);
  assert.match(source, /postMove\('rescue'/);
  assert.match(source, /postMove\('sale'/);
  assert.match(source, /postMove\('kitchen_waste'/);
  const list = readFileSync(
    'components/features/inventory/SubInventoryTransferList.tsx',
    'utf8'
  );
  assert.match(list, /suggestedPullQty\(row\)/);
  assert.equal(list.includes('return row.onHand'), false);
});
