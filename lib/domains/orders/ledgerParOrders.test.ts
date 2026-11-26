import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ledgerParOrderLines } from '@/components/features/orders/supplierMail';
import { stockFromPar } from '@/lib/domains/inventory/parLevel';

test('order lines use ledger on-hand against par', () => {
  const short = stockFromPar({ onHand: 2, casePackSize: 6, unitCost: 1.5, parCases: 2 });
  const stocked = stockFromPar({ onHand: 12, casePackSize: 6, unitCost: 1.5, parCases: 2 });
  assert.equal(short.low, true);
  assert.equal(short.orderCases, 2);
  assert.equal(stocked.low, false);
  assert.equal(stocked.orderCases, 0);
  const lines = ledgerParOrderLines([
    { name: 'Bananas', low: short.low },
    { name: 'Milk', low: stocked.low },
  ]);
  assert.deepEqual(
    lines.map((line) => line.name),
    ['Bananas']
  );
});

test('purchase order stock comes from the inventory ledger, not legacy items or mock data', () => {
  const page = readFileSync('app/orders/page.tsx', 'utf8');
  const route = readFileSync('app/api/orders/buy-list/route.ts', 'utf8');
  const buyList = readFileSync('components/features/orders/BuyList.tsx', 'utf8');
  const forecasting = readFileSync('lib/domains/inventory/forecasting.ts', 'utf8');
  const stock = readFileSync('lib/domains/inventory/stock.ts', 'utf8');
  const mail = readFileSync('components/features/orders/supplierMail.ts', 'utf8');

  for (const source of [page, route, buyList, forecasting, mail]) {
    assert.equal(source.includes('mockData'), false);
    assert.equal(source.includes('inventory_items'), false);
    assert.equal(source.includes('getInventoryItems'), false);
    assert.equal(source.includes('INITIAL_INVENTORY_ITEMS'), false);
  }

  assert.match(page, /getBuyListLevelsRsc/);
  assert.match(route, /getBuyListLevelsWithForecast/);
  assert.match(forecasting, /getStockLevelsWithPosSales/);
  assert.match(mail, /ledgerParOrderLines\(rows\)/);
  assert.match(buyList, /marksFromPurchaseOrders/);
  assert.match(page, /PurchaseOrderErrorBoundary/);

  const query = stock.slice(
    stock.indexOf('async function queryStockLevelRows'),
    stock.indexOf('const posSalesCache')
  );
  assert.match(query, /Inventory_Transactions/);
  assert.match(query, /parCases/);
  assert.equal(query.includes('inventory_items'), false);
  assert.equal(query.includes('mockData'), false);
  assert.match(stock, /resolveParCases\(row\.parCases, storeDefaultParCases\)/);
});
