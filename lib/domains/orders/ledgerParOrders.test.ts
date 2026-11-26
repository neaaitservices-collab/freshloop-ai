import assert from 'node:assert/strict';
import test from 'node:test';
import { marksFromPurchaseOrders, openOrderRows } from '@/components/features/orders/supplierMail';
import { stockFromPar } from '@/lib/domains/inventory/parLevel';
import { getStockLevel, postProductReceipt, type StockLevel } from '@/lib/domains/inventory/stock';
import { prisma } from '@/lib/db/prisma';

const now = new Date('2026-11-26T12:00:00.000Z');

function lowRow(productId: string): StockLevel {
  const par = stockFromPar({ onHand: 2, casePackSize: 6, unitCost: 1.5, parCases: 2 });
  return { productId, low: par.low, name: productId } as StockLevel;
}

test('a ledger receipt below par is a line to order', () => {
  const short = stockFromPar({ onHand: 2, casePackSize: 6, unitCost: 1.5, parCases: 2 });
  const stocked = stockFromPar({ onHand: 12, casePackSize: 6, unitCost: 1.5, parCases: 2 });
  assert.equal(short.low, true);
  assert.equal(short.orderCases, 2);
  assert.equal(stocked.low, false);
  const lines = openOrderRows(
    [
      { ...lowRow('Bananas'), low: short.low },
      { ...lowRow('Milk'), low: stocked.low },
    ],
    {}
  );
  assert.deepEqual(
    lines.map((line) => line.productId),
    ['Bananas']
  );
});

test('an old sent order does not keep the product off the buy list', () => {
  const marks = marksFromPurchaseOrders(
    [{ productIds: ['A'], status: 'SENT', updatedAt: '2026-09-01T00:00:00.000Z' }],
    { now }
  );
  assert.deepEqual(marks, {});
  assert.equal(openOrderRows([lowRow('A')], marks).length, 1);
});

test('an old approved order does not keep the product off the buy list', () => {
  const marks = marksFromPurchaseOrders(
    [{ productIds: ['A'], status: 'APPROVED', updatedAt: '2026-09-01T00:00:00.000Z' }],
    { now }
  );
  assert.deepEqual(marks, {});
  assert.equal(openOrderRows([lowRow('A')], marks).map((row) => row.productId).join(','), 'A');
});

test('a receipt after the order makes the product orderable again', () => {
  const sentAt = '2026-11-20T12:00:00.000Z';
  const marks = marksFromPurchaseOrders(
    [
      { productIds: ['A'], status: 'SENT', updatedAt: sentAt },
      { productIds: ['B'], status: 'APPROVED', updatedAt: sentAt },
    ],
    {
      now,
      lastReceiptAt: {
        A: '2026-11-25T12:00:00.000Z',
        B: '2026-11-25T12:00:00.000Z',
      },
    }
  );
  assert.deepEqual(marks, {});
  assert.deepEqual(
    openOrderRows([lowRow('A'), lowRow('B')], marks).map((row) => row.productId),
    ['A', 'B']
  );
});

test('a recent order newer than the last receipt still marks the line', () => {
  const marks = marksFromPurchaseOrders(
    [{ productIds: ['A'], status: 'SENT', updatedAt: '2026-11-24T12:00:00.000Z' }],
    { now, lastReceiptAt: { A: '2026-11-01T00:00:00.000Z' } }
  );
  assert.equal(marks.A, 'sent');
  assert.equal(openOrderRows([lowRow('A')], marks).length, 0);
});

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

test('low stock comes from a ledger receipt against par', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `par-${Date.now()}`;
  const product = await prisma.product.create({
    data: {
      name: `Bananas ${stamp}`,
      department: 'PRODUCE',
      supplier: `North Farm ${stamp}`,
      casePackSize: 6,
      parCases: 2,
      standardCost: 1.5,
    },
  });

  t.after(async () => {
    await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryItem.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });

  await postProductReceipt({
    productId: product.id,
    quantityUnits: 2,
    unitCostAtTime: 1.5,
    staffId: 'test-staff',
    referenceId: `PO-PAR-${stamp}`,
  });

  const level = await getStockLevel(product.id);
  assert.equal(level.low, true);
  assert.equal(level.orderCases, 2);
  assert.equal(level.parCases, 2);
  assert.ok(level.lastReceiptAt);
  assert.equal(await prisma.inventoryItem.count({ where: { productId: product.id } }), 0);
  const legacyMarks = marksFromPurchaseOrders(
    [{ productIds: [product.id], status: 'SENT', updatedAt: '2026-09-01T00:00:00.000Z' }],
    { now, lastReceiptAt: { [product.id]: level.lastReceiptAt } }
  );
  assert.equal(legacyMarks[product.id], undefined);
  assert.equal(openOrderRows([{ ...level, low: true }], legacyMarks).length, 1);
});
