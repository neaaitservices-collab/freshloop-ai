import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { mergeReadPages } from '@/lib/domains/receiving/invoicePageScan';
import {
  INVOICE_901452_POSTED_LINES,
  INVOICE_901452_TOTAL,
  invoice901452Pages,
} from '@/lib/domains/receiving/invoice901452.fixture';
import { settleCommitPosts } from '@/lib/domains/receiving/invoiceOcrCommit';
import {
  isNonStockInvoiceLine,
  RECEIPT_TIMEOUT_REASON,
  receivingPostFailureReason,
  type ReceivingLogPostInput,
  type ReceivingLogPostResult,
} from '@/lib/domains/receiving/receivingLogPost';

test('invoice 901452 keeps page 2 lines and drops zero, fuel, and comment rows', () => {
  const merged = mergeReadPages(invoice901452Pages());
  assert.equal(merged.invoiceNumber, '901452');
  assert.equal(merged.invoiceDate, '2026-11-17');
  assert.equal(merged.lines.length, INVOICE_901452_POSTED_LINES);
  assert.equal(merged.lineSum, INVOICE_901452_TOTAL);
  assert.deepEqual(merged.pageScanBlockers, []);
  const page2 = merged.lines.filter((line) => line.page === 2).map((line) => line.code);
  assert.deepEqual(page2, [
    'BAS1F',
    'CUE5C',
    'MI1C',
    'ESC1B',
    'ON06A',
    'WAT4E',
    'APCR3C',
    'BL1FH',
    'BL2C',
    'RA5F',
    'SA1C',
    'TH1',
  ]);
  const codes = merged.lines.map((line) => line.code);
  assert.equal(codes.includes('POFY25'), true);
  assert.equal(codes.includes('AV36'), false);
  assert.equal(codes.includes('FUEL'), false);
  assert.equal(codes.includes('XCALL'), false);
  assert.equal(
    Number(merged.lines.reduce((sum, line) => sum + (line.totalCost ?? 0), 0).toFixed(2)),
    INVOICE_901452_TOTAL
  );
});

test('fuel and comment lines are not stock even with a printed price', () => {
  assert.equal(isNonStockInvoiceLine({ supplierCode: 'FUEL', itemName: 'FUEL SURCHARGE' }), true);
  assert.equal(isNonStockInvoiceLine({ supplierCode: 'xcall', itemName: 'SEE COMMENT LINE' }), true);
  assert.equal(isNonStockInvoiceLine({ supplierCode: 'POFY25', itemName: 'YELLOW FINGERLING 25LB' }), false);
});

test('confirm skips a priced fuel row instead of posting it', async () => {
  const posted: string[] = [];
  const fuel: ReceivingLogPostInput = {
    itemName: 'FUEL SURCHARGE',
    supplierCode: 'FUEL',
    casesReceived: 1,
    caseCost: 12,
    packSize: 1,
    splitFactor: 1,
    retailUnit: 'units',
    marginMode: '40',
    currentRetailPrice: 0,
    externalLogId: '33333333-3333-4333-8333-333333333333',
  };
  const apples: ReceivingLogPostInput = {
    ...fuel,
    itemName: 'ORGANIC BANANA',
    supplierCode: 'VOBA02',
    caseCost: 53.25,
    externalLogId: '44444444-4444-4444-8444-444444444444',
  };
  const settled = await settleCommitPosts([apples, fuel], async (post) => {
    posted.push(post.itemName);
    const row: ReceivingLogPostResult = {
      itemName: post.itemName,
      stock: {
        posted: true,
        transactionId: 'tx',
        productId: 'bananas',
        unitsAdded: 1,
        onHand: 1,
        productName: post.itemName,
      },
    };
    return row;
  });
  assert.deepEqual(posted, ['ORGANIC BANANA']);
  assert.equal(settled.receipts[1]?.transactionId, '');
  assert.equal(settled.postedRows.length, 1);
});

test('a closed receipt transaction tells the clerk to confirm again', () => {
  const error = new Prisma.PrismaClientKnownRequestError(
    'Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 20000 ms, however 20093 ms passed since the start of the transaction.',
    { code: 'P2028', clientVersion: 'test' }
  );
  assert.equal(receivingPostFailureReason(error), RECEIPT_TIMEOUT_REASON);
});
