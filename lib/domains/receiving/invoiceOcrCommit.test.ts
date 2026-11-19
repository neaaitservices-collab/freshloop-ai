import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveInvoiceReceipt, settleCommitPosts } from '@/lib/domains/receiving/invoiceOcrCommit';
import type { ReceivingLogPostInput, ReceivingLogPostResult } from '@/lib/domains/receiving/receivingLogPost';
import { draftIsFullyPosted } from '@/lib/domains/receiving/invoiceOcrReceive';

function commitPost(overrides: Partial<ReceivingLogPostInput>): ReceivingLogPostInput {
  return {
    itemName: 'Apples',
    casesReceived: 2,
    caseCost: 4,
    packSize: 1,
    splitFactor: 1,
    retailUnit: 'units',
    marginMode: '40',
    currentRetailPrice: 1,
    externalLogId: '33333333-3333-4333-8333-333333333333',
    ...overrides,
  };
}

test('case receipts use catalog sellable units per case, not raw invoice pack', () => {
  const resolved = resolveInvoiceReceipt(
    {
      product_id: 'sku',
      quantity: 2,
      quantity_kind: 'cases',
      unit_cost: 24,
      case_pack_size: 12,
    },
    6
  );
  assert.equal(resolved.units, 12);
  assert.equal(resolved.unitCost, 4);
});

test('unit receipts keep the quoted unit cost', () => {
  const resolved = resolveInvoiceReceipt(
    { product_id: 'sku', quantity: 3, unit_cost: 1.25 },
    12
  );
  assert.equal(resolved.units, 3);
  assert.equal(resolved.unitCost, 1.25);
});

test('a $0 line is left out of stock and the paid lines still post', async () => {
  const posted: string[] = [];
  const settled = await settleCommitPosts(
    [commitPost({ itemName: 'Paid apples', caseCost: 4 }), commitPost({ itemName: 'Free greens', caseCost: 0, casesReceived: 1 })],
    async (post) => {
      posted.push(post.itemName);
      const row: ReceivingLogPostResult = {
        itemName: post.itemName,
        stock: {
          posted: true,
          transactionId: 'tx-paid',
          productId: 'paid',
          unitsAdded: post.casesReceived,
          onHand: post.casesReceived,
          productName: post.itemName,
        },
      };
      return row;
    }
  );
  assert.deepEqual(posted, ['Paid apples']);
  assert.equal(settled.postedRows.length, 1);
  assert.equal(settled.receipts[0]?.unitsAdded, 2);
  assert.equal(settled.receipts[1]?.unitsAdded, 0);
  assert.equal(settled.receipts[1]?.transactionId, '');
  assert.equal(
    draftIsFullyPosted({
      lines: [{}, {}],
      postedLineIndexes: [0],
      skippedReviewIndexes: [1],
    }),
    true
  );
});

test('a zero quantity does not invent units', () => {
  const resolved = resolveInvoiceReceipt(
    { product_id: 'sku', quantity: 0, quantity_kind: 'cases', unit_cost: 10 },
    8
  );
  assert.deepEqual(resolved, { units: 0, unitCost: 0 });
});
