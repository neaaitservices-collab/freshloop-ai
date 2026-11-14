import assert from 'node:assert/strict';
import test from 'node:test';
import { draftForRows } from '@/components/features/orders/supplierMail';
import { stockFromPar } from '@/lib/domains/inventory/parLevel';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import {
  countsAsShortDatedAlert,
  isOrderShortDated,
  orderAlertHint,
  orderAlertHref,
  parseOrderAlertSearch,
  rowsForOrderAlert,
  shortDatedChipCount,
} from '@/lib/domains/orders/orderAlertLink';

function row(patch: Partial<StockLevel> & Pick<StockLevel, 'productId' | 'name' | 'department'>): StockLevel {
  const onHand = patch.onHand ?? 4;
  const casePackSize = patch.casePackSize ?? 6;
  const unitCost = patch.unitCost ?? 2;
  const parCases = patch.parCases ?? 2;
  return {
    supplier: 'Valley',
    category: 'Produce',
    productType: 'Fresh',
    origin: null,
    unitType: 'EA',
    receivePackSize: casePackSize,
    splitFactor: 1,
    kitchenPrepQty: 0,
    receiveCaseCost: null,
    pullSensitivityDays: null,
    pullDays: 3,
    caseRetailPrice: null,
    retailPrice: null,
    regularRetailPrice: null,
    isMarkdown: false,
    daysRemaining: 6,
    ...stockFromPar({ onHand, casePackSize, unitCost, parCases }),
    ...patch,
    onHand,
    casePackSize,
    unitCost,
    parCases,
  };
}

test('alert chips and the department order button build order links', () => {
  assert.equal(
    orderAlertHref({ code: 'PRODUCE', department: 'Produce', alert: 'below-par' }),
    '/orders?department=PRODUCE&alert=below-par&name=Produce'
  );
  assert.equal(
    orderAlertHref({ code: 'PRODUCE', department: 'Produce', alert: 'short-dated' }),
    '/orders?department=PRODUCE&alert=short-dated&name=Produce'
  );
  assert.equal(
    orderAlertHref({ code: 'PRODUCE', department: 'Produce', alert: 'flagged' }),
    '/orders?department=PRODUCE&alert=flagged&name=Produce'
  );
  assert.deepEqual(parseOrderAlertSearch({ department: 'PRODUCE', alert: 'flagged', name: 'Produce' }), {
    department: 'PRODUCE',
    name: 'Produce',
    alert: 'flagged',
  });
  assert.equal(parseOrderAlertSearch({ department: '', alert: 'below-par' }), null);
  assert.equal(parseOrderAlertSearch({ department: 'PRODUCE', alert: 'operations' }), null);

  assert.match(orderAlertHint(10, 14), /those 10 items filled to par/);
  assert.match(orderAlertHint(10, 14), /those 14 items, to cut the next order/);
  assert.equal(orderAlertHint(0, 2).includes('filled to par'), false);
  assert.match(orderAlertHint(1, 0), /1 item filled to par/);
});

test('below par fills the order to par and short-dated stays on the order to cut', () => {
  const below = row({
    productId: 'apple',
    name: 'Apples',
    department: 'PRODUCE',
    onHand: 2,
    parCases: 2,
    casePackSize: 6,
    daysRemaining: 8,
  });
  const shortDated = row({
    productId: 'berries',
    name: 'Berries',
    department: 'PRODUCE',
    onHand: 20,
    parCases: 1,
    casePackSize: 6,
    daysRemaining: 1,
    expirationDate: new Date(Date.now() + 12 * 60 * 60 * 1000),
  });
  const dairy = row({
    productId: 'milk',
    name: 'Milk',
    department: 'DAIRY',
    category: 'Dairy',
    onHand: 1,
    parCases: 3,
    daysRemaining: 1,
  });
  const levels = [below, shortDated, dairy];
  const focus = parseOrderAlertSearch({ department: 'PRODUCE', alert: 'below-par', name: 'Produce' });
  assert.ok(focus);
  const belowRows = rowsForOrderAlert(levels, focus);
  assert.deepEqual(
    belowRows.map((item) => item.productId),
    ['apple']
  );
  assert.ok(belowRows[0]!.orderCases > 0);
  assert.match(draftForRows('Valley', belowRows).body, /cases - Apples/);

  const shortFocus = { ...focus, alert: 'short-dated' as const };
  const shortRows = rowsForOrderAlert(levels, shortFocus);
  assert.deepEqual(
    shortRows.map((item) => item.productId),
    ['berries']
  );
  assert.equal(isOrderShortDated(shortRows[0]!), true);
  assert.match(draftForRows('Valley', shortRows).body, /Short-dated - Berries/);
  assert.equal(draftForRows('Valley', shortRows).body.includes('In stock'), false);

  const flagged = rowsForOrderAlert(levels, { ...focus, alert: 'flagged' });
  assert.deepEqual(
    flagged.map((item) => item.productId),
    ['apple', 'berries']
  );
  assert.equal(
    rowsForOrderAlert(levels, { department: 'Produce', name: 'Produce', alert: 'below-par' }).length,
    1
  );
});

test('short-dated chip count matches the order list and skips a null expiry', () => {
  const now = new Date('2026-11-13T12:00:00.000Z');
  const within = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const later = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const real = row({
    productId: 'berries',
    name: 'Berries',
    department: 'PRODUCE',
    onHand: 20,
    parCases: 1,
    casePackSize: 6,
    daysRemaining: 1,
    expirationDate: within,
  });
  const shelfOnly = row({
    productId: 'greens',
    name: 'Greens',
    department: 'PRODUCE',
    onHand: 12,
    parCases: 1,
    casePackSize: 6,
    daysRemaining: 1,
    expirationDate: null,
  });
  const laterExpiry = row({
    productId: 'apples',
    name: 'Apples',
    department: 'PRODUCE',
    onHand: 8,
    parCases: 1,
    casePackSize: 6,
    daysRemaining: 4,
    expirationDate: later,
  });
  const emptyShelf = row({
    productId: 'pears',
    name: 'Pears',
    department: 'PRODUCE',
    onHand: 0,
    parCases: 2,
    casePackSize: 6,
    expirationDate: within,
  });
  const levels = [real, shelfOnly, laterExpiry, emptyShelf];
  assert.equal(shelfOnly.daysRemaining <= 2, true);
  assert.equal(countsAsShortDatedAlert(shelfOnly, now), false);
  assert.equal(isOrderShortDated(shelfOnly, now), false);

  const focus = parseOrderAlertSearch({ department: 'PRODUCE', alert: 'short-dated', name: 'Produce' });
  assert.ok(focus);
  const ordered = rowsForOrderAlert(levels, focus, now);
  assert.equal(shortDatedChipCount(levels, now), ordered.length);
  assert.deepEqual(
    ordered.map((item) => item.productId),
    ['berries']
  );
  assert.equal(ordered.some((item) => item.productId === 'greens'), false);
});
