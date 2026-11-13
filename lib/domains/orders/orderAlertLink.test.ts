import assert from 'node:assert/strict';
import test from 'node:test';
import { draftForRows } from '@/components/features/orders/supplierMail';
import { stockFromPar } from '@/lib/domains/inventory/parLevel';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import {
  isOrderShortDated,
  orderAlertHint,
  orderAlertHref,
  parseOrderAlertSearch,
  rowsForOrderAlert,
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
  assert.match(draftForRows('Valley', shortRows).body, /In stock - Berries/);

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
