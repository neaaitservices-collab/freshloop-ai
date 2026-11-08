import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryLedgerError, executeBundleSale, prisma } from '@/lib/domains/inventory/ledger';
import { postProductReceipt } from '@/lib/domains/inventory/stock';
import { postReceivingLogToInventory } from '@/lib/domains/receiving/receivingLogPost';
import {
  commitInvoiceOcrReceipts,
  saveInvoiceOcrDraft,
} from '@/lib/domains/receiving/invoiceOcrCommit';
import { getCurrentStock } from '@/lib/domains/inventory/ledger';
import { InventoryLocation } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

test('concurrent bundle sales cannot drive on-hand negative', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `race-${Date.now()}`;
  const product = await prisma.product.create({
    data: {
      name: `Race Apple ${stamp}`,
      department: 'PRODUCE',
      standardCost: 1,
      retailPrice: 2,
      shelfLifeDays: 5,
    },
  });
  const bundle = await prisma.bundle.create({
    data: {
      name: `Race bundle ${stamp}`,
      bundleSku: `RACE-${stamp}`,
      bundlePrice: 3,
      items: { create: [{ productId: product.id, quantity: 1 }] },
    },
  });

  t.after(async () => {
    await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.bundleItem.deleteMany({ where: { bundleId: bundle.id } });
    await prisma.bundle.delete({ where: { id: bundle.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });

  await postProductReceipt({
    productId: product.id,
    quantityUnits: 1,
    unitCostAtTime: 1,
    staffId: 'test-staff',
    referenceId: `RACE-RCV-${stamp}`,
  });

  const results = await Promise.allSettled([
    executeBundleSale(bundle.bundleSku, `RACE-A-${stamp}`, { staffId: 'test-staff', quantitySold: 1 }),
    executeBundleSale(bundle.bundleSku, `RACE-B-${stamp}`, { staffId: 'test-staff', quantitySold: 1 }),
  ]);

  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  const reason = rejected[0]?.status === 'rejected' ? rejected[0].reason : null;
  assert.ok(reason instanceof InventoryLedgerError || reason instanceof Error);

  const onHand = await getCurrentStock(product.id, InventoryLocation.Retail_Floor);
  assert.equal(onHand, 0);
});

test('duplicate receiving external ids post once', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `recv-dup-${Date.now()}`;
  const externalLogId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  t.after(async () => {
    await prisma.receivingDelivery.deleteMany({ where: { id: externalLogId } });
    await prisma.ledgerIdempotencyKey.deleteMany({ where: { key: `recv:${externalLogId}` } });
    await prisma.inventoryLot.deleteMany({
      where: { product: { name: `Dup Apple ${stamp}` } },
    });
    await prisma.inventoryTransaction.deleteMany({
      where: { product: { name: `Dup Apple ${stamp}` } },
    });
    await prisma.product.deleteMany({ where: { name: `Dup Apple ${stamp}` } });
  });

  const line = {
    itemName: `Dup Apple ${stamp}`,
    casesReceived: 1,
    caseCost: 12,
    packSize: 4,
    splitFactor: 1,
    retailUnit: 'units' as const,
    marginMode: '40' as const,
    currentRetailPrice: 5,
    externalLogId,
  };
  const first = await postReceivingLogToInventory(line, 'test-staff', null);
  const second = await postReceivingLogToInventory(line, 'test-staff', null);

  assert.equal(first.stock.posted, true);
  assert.equal(second.stock.posted, true);
  if (first.stock.posted && second.stock.posted) {
    assert.equal(second.stock.idempotent, true);
    assert.equal(second.stock.unitsAdded, first.stock.unitsAdded);
    const onHand = await getCurrentStock(first.stock.productId, InventoryLocation.Retail_Floor);
    assert.equal(onHand, 4);
  }
});

test('duplicate invoice commits post once', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `inv-dup-${Date.now()}`;
  const product = await prisma.product.create({
    data: {
      name: `Invoice Apple ${stamp}`,
      department: 'PRODUCE',
      standardCost: 1,
      retailPrice: 3,
      shelfLifeDays: 5,
    },
  });
  const draft = await saveInvoiceOcrDraft('test-staff', {
    vendorName: `Vendor ${stamp}`,
    invoiceNumber: `INV-${stamp}`,
    invoiceDate: '2026-11-08',
    totalAmount: 4,
    departmentBreakdown: { PRODUCE: 4 },
    lines: [
      {
        product_id: product.id,
        quantity: 2,
        quantity_kind: 'units',
        unit_cost: 2,
        line_name: `Invoice Apple ${stamp}`,
        department: 'PRODUCE',
        line_confidence: 0.95,
        requires_approval: false,
      },
    ],
  });
  const key = `invoice:vendor ${stamp}:inv-${stamp}`;

  t.after(async () => {
    await prisma.ledgerIdempotencyKey.deleteMany({ where: { key } });
    await prisma.invoiceOcrDraft.deleteMany({ where: { id: draft.id } });
    await prisma.invoiceLineItem.deleteMany({ where: { inventoryItem: { productId: product.id } } });
    await prisma.vendorInvoice.deleteMany({ where: { invoiceNumber: `INV-${stamp}` } });
    await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });

  const input = {
    staffId: 'test-staff',
    referenceId: `INV-${stamp}`,
    idempotencyKey: key,
    draftId: draft.id,
    actorIsManager: false,
    confirmedItems: [
      {
        product_id: product.id,
        quantity: 2,
        quantity_kind: 'units' as const,
        unit_cost: 2,
        line_name: `Invoice Apple ${stamp}`,
        line_confidence: 0.95,
      },
    ],
    invoiceMeta: {
      vendorName: `Vendor ${stamp}`,
      invoiceNumber: `INV-${stamp}`,
      invoiceDate: '2026-11-08',
      totalAmount: 4,
      departmentBreakdown: { PRODUCE: 4 },
    },
  };

  const firstCommit = await commitInvoiceOcrReceipts(input);
  let duplicate = false;
  try {
    await commitInvoiceOcrReceipts(input);
  } catch (error) {
    duplicate =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002';
  }
  assert.equal(duplicate, true);
  assert.equal(firstCommit.transactionsCreated, 1);
  const onHand = await getCurrentStock(product.id, InventoryLocation.Retail_Floor);
  assert.equal(onHand, 2);
  const invoices = await prisma.vendorInvoice.count({ where: { invoiceNumber: `INV-${stamp}` } });
  assert.equal(invoices, 1);
});
