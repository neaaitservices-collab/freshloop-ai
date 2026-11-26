import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoleProvider } from '@/components/auth/RoleProvider';
import { RetailFloorTransferPanel } from '@/components/features/inventory/RetailFloorTransferPanel';
import {
  effectivePullDays,
  inShortDatedTransferQueue,
  normalizePullSensitivityDays,
  storePullSensitivityDaysSchema,
} from '@/lib/domains/inventory/pullSensitivity';
import type { StockLevel } from '@/lib/domains/inventory/stock';

function level(
  partial: Partial<StockLevel> & Pick<StockLevel, 'productId' | 'name' | 'daysRemaining'>
): StockLevel {
  const { productId, name, daysRemaining, ...rest } = partial;
  return {
    productId,
    name,
    supplier: 'Vendor',
    department: 'PRODUCE',
    category: 'PRODUCE',
    productType: 'RETAIL',
    origin: null,
    unitType: 'UNIT',
    casePackSize: 1,
    receivePackSize: 1,
    splitFactor: 1,
    unitCost: 1,
    onHand: 4,
    kitchenPrepQty: 0,
    parUnits: 0,
    onHandCases: 4,
    parCases: 2,
    orderCases: 0,
    orderCost: 0,
    low: false,
    receiveCaseCost: null,
    pullSensitivityDays: null,
    pullDays: 3,
    caseRetailPrice: null,
    retailPrice: 2,
    regularRetailPrice: 2,
    isMarkdown: false,
    daysRemaining,
    ...rest,
  };
}

test('short-dated transfer queue matches the labeled pull window', () => {
  assert.equal(inShortDatedTransferQueue(3, 3), true);
  assert.equal(inShortDatedTransferQueue(4, 3), false);
  assert.equal(inShortDatedTransferQueue(0, 3), true);
});

test('store pull window schema allows only 2, 3, and 4', () => {
  for (const value of [2, 3, 4] as const) {
    assert.equal(storePullSensitivityDaysSchema.parse(value), value);
  }
  for (const value of [1, 5, 0, 2.5, '3', '4', null, undefined, true]) {
    assert.equal(storePullSensitivityDaysSchema.safeParse(value).success, false, String(value));
  }
});

test('a per-SKU override wins over the store default', () => {
  assert.equal(effectivePullDays(2, 4), 2);
  assert.equal(effectivePullDays(4, 2), 4);
  assert.equal(effectivePullDays(null, 4), 4);
  assert.equal(effectivePullDays(undefined, 2), 2);
  assert.equal(effectivePullDays(9, 4), 4);
  assert.equal(normalizePullSensitivityDays(9), 3);
  assert.equal(effectivePullDays(null, normalizePullSensitivityDays(9)), 3);

  const stricter = effectivePullDays(2, 4);
  assert.equal(inShortDatedTransferQueue(2, stricter), true);
  assert.equal(inShortDatedTransferQueue(3, stricter), false);
  assert.equal(inShortDatedTransferQueue(4, effectivePullDays(null, 4)), true);
  assert.equal(inShortDatedTransferQueue(5, effectivePullDays(null, 4)), false);
  assert.equal(inShortDatedTransferQueue(4, effectivePullDays(4, 2)), true);
});

test('the short-dated board lists the same days it prints', () => {
  const SessionShell = RoleProvider as ComponentType<{ session: null; children?: ReactNode }>;
  const html = renderToStaticMarkup(
    createElement(
      SessionShell,
      { session: null },
      createElement(RetailFloorTransferPanel, {
        levels: [
          level({
            productId: 'store-in',
            name: 'Store Window Milk',
            daysRemaining: 3,
            pullSensitivityDays: null,
          }),
          level({
            productId: 'store-out',
            name: 'Outside Window Kale',
            daysRemaining: 4,
            pullSensitivityDays: null,
          }),
          level({
            productId: 'strict-out',
            name: 'Override Too Early',
            daysRemaining: 3,
            pullSensitivityDays: 2,
          }),
          level({
            productId: 'strict-in',
            name: 'Override In Window',
            daysRemaining: 2,
            pullSensitivityDays: 2,
          }),
          level({
            productId: 'wide-in',
            name: 'Wider Override Berries',
            daysRemaining: 4,
            pullSensitivityDays: 4,
          }),
        ],
        pullDays: 3,
        priorityOnly: true,
        onSuccess: () => {},
        onError: () => {},
      })
    )
  );

  assert.match(html, /data-store-pull-days="3"/);
  assert.match(html, /Pull window ≤3 days/);
  assert.match(html, /Store Window Milk/);
  assert.match(html, /data-pull-window="3"/);
  assert.match(html, /≤3d pull/);
  assert.equal(html.includes('Outside Window Kale'), false);
  assert.equal(html.includes('Override Too Early'), false);
  assert.match(html, /Override In Window/);
  assert.match(html, /data-pull-window="2"/);
  assert.match(html, /≤2d pull/);
  assert.match(html, /Wider Override Berries/);
  assert.match(html, /data-pull-window="4"/);
  assert.match(html, /≤4d pull/);
});

test('the pull window is loaded from store settings and is not seeded with 3', () => {
  const hook = readFileSync('hooks/use-store-pull-sensitivity-days.ts', 'utf8');
  const floor = readFileSync('app/inventory/floor/page.tsx', 'utf8');
  const inventory = readFileSync('app/inventory/page.tsx', 'utf8');
  const production = readFileSync('app/production/page.tsx', 'utf8');
  const dashboard = readFileSync('components/features/production/ProductionDashboard.tsx', 'utf8');
  const workspace = readFileSync('components/features/inventory/AdminInventoryWorkspace.tsx', 'utf8');
  assert.equal(hook.includes('useState<StorePullSensitivityDays>(3)'), false);
  assert.equal(hook.includes('useState(3)'), false);
  assert.match(floor, /getPlatformSettings/);
  assert.match(floor, /normalizePullSensitivityDays/);
  assert.match(inventory, /getPlatformSettings/);
  assert.match(production, /normalizePullSensitivityDays/);
  assert.equal(dashboard.includes('useState<2 | 3 | 4>(3)'), false);
  assert.match(workspace, /method: 'PATCH'/);
  assert.match(workspace, /\/api\/admin\/settings/);
  assert.match(workspace, /pullSensitivityDays: days/);
});
