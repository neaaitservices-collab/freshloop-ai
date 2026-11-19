import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { InventoryLedgerError } from '@/lib/domains/inventory/ledger';
import {
  isZeroDollarReceivingLine,
  MISSING_LOCATION_REASON,
  postReceivingLogToInventory,
  RECEIVING_VALIDATION_REASON,
  receivingPostFailureReason,
  splitUnreadReceivingLines,
  STOCK_NOT_UPDATED,
  UNMATCHED_PRODUCT_REASON,
  ZERO_DOLLAR_REVIEW_REASON,
  type ReceivingLogPostInput,
} from '@/lib/domains/receiving/receivingLogPost';

const deliveryId = '33333333-3333-4333-8333-333333333333';

function line(overrides: Partial<ReceivingLogPostInput> = {}): ReceivingLogPostInput {
  return {
    itemName: 'Old bananas',
    casesReceived: 2,
    caseCost: 0,
    packSize: 1,
    splitFactor: 1,
    retailUnit: 'units',
    marginMode: '40',
    currentRetailPrice: 1,
    externalLogId: deliveryId,
    ...overrides,
  };
}

function prismaKnown(code: string, meta: Record<string, unknown>, message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: 'test',
    meta,
  });
}

test('a failed post names an unmatched product without database internals', () => {
  const error = prismaKnown(
    'P2003',
    { field_name: 'Product_ID', modelName: 'InventoryTransaction' },
    'Foreign key constraint violated on the constraint: `Inventory_Transactions_Product_ID_fkey`'
  );
  const reason = receivingPostFailureReason(error);
  assert.equal(reason, UNMATCHED_PRODUCT_REASON);
  assert.doesNotMatch(reason, /P2003|fkey|prisma|SELECT|Inventory_Transactions/i);
});

test('a failed post names a missing location without the query', () => {
  const error = new Prisma.PrismaClientValidationError(
    'Invalid `prisma.inventoryTransaction.create()` invocation:\n\n{\n  toLocation: "Nowhere"\n}\n\nInvalid value for argument `toLocation`. Expected InventoryLocation.',
    { clientVersion: 'test' }
  );
  const reason = receivingPostFailureReason(error);
  assert.equal(reason, MISSING_LOCATION_REASON);
  assert.doesNotMatch(reason, /prisma|toLocation|invocation/i);
});

test('a validation failure keeps a safe field message and drops a stack', () => {
  const parsed = z.object({ caseCost: z.number().min(0, 'Case cost must be zero or greater.') }).safeParse({
    caseCost: -1,
  });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.equal(receivingPostFailureReason(parsed.error), 'caseCost: Case cost must be zero or greater.');
  }

  const safe = new Error('Pack size and split factor must be greater than 0.');
  assert.equal(receivingPostFailureReason(safe), safe.message);

  const leaked = new Error('Pack size must be greater than 0.\n    at postReceipt (lib/domains/inventory/stock.ts:10:1)');
  assert.equal(receivingPostFailureReason(leaked), STOCK_NOT_UPDATED);

  const ledger = new InventoryLedgerError('Pick a department before this receipt can be saved.', 'DEPARTMENT_REQUIRED', 400);
  assert.equal(receivingPostFailureReason(ledger), ledger.message);

  const unknown = new Prisma.PrismaClientKnownRequestError('Raw query failed', {
    code: 'P2010',
    clientVersion: 'test',
    meta: { query: 'SELECT * FROM products' },
  });
  assert.equal(receivingPostFailureReason(unknown), STOCK_NOT_UPDATED);
  assert.equal(receivingPostFailureReason(new Error('')), STOCK_NOT_UPDATED);
  assert.equal(RECEIVING_VALIDATION_REASON.includes('validation'), true);
});

test('a $0 line is review-only and is not posted to stock', async () => {
  assert.equal(isZeroDollarReceivingLine({ caseCost: 0 }), true);
  assert.equal(isZeroDollarReceivingLine({ caseCost: undefined }), false);
  assert.equal(isZeroDollarReceivingLine({}), false);

  const posted = await postReceivingLogToInventory(line(), 'staff-1', null);
  assert.equal(posted.stock.posted, false);
  if (!posted.stock.posted) assert.equal(posted.stock.reason, ZERO_DOLLAR_REVIEW_REASON);

  const split = splitUnreadReceivingLines([
    { itemName: 'Paid apples', casesReceived: 2, caseCost: 4, externalLogId: 'paid' },
    { itemName: 'Free greens', casesReceived: 3, caseCost: 0, externalLogId: 'free' },
    { itemName: 'Unread', casesReceived: 0, externalLogId: 'blank' },
  ]);
  assert.deepEqual(
    split.rest.map((row) => row.externalLogId),
    ['paid']
  );
  assert.equal(split.unread[0]?.stock.reason, ZERO_DOLLAR_REVIEW_REASON);
  assert.match(split.unread[1]?.stock.reason ?? '', /not read/i);
});
