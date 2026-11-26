import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prisma } from '@/lib/domains/inventory/ledger';
import {
  commitInvoiceOcrReceipts,
  quantityKindForInvoiceUnit,
  saveInvoiceOcrDraft,
  type OcrCommitLine,
} from '@/lib/domains/receiving/invoiceOcrCommit';
import { postInvoiceReceiptBatch } from '@/lib/domains/receiving/invoiceReceiptBatch';
import {
  INVOICE_901452_POSTED_LINES,
  INVOICE_901452_TOTAL,
  invoice901452MergedLines,
} from '@/lib/domains/receiving/invoice901452.fixture';
import type { ReceivingLogPostInput } from '@/lib/domains/receiving/receivingLogPost';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

function commitLines(): OcrCommitLine[] {
  return invoice901452MergedLines().map((line) => ({
    product_id: '',
    quantity: line.quantity ?? 0,
    quantity_kind: quantityKindForInvoiceUnit(line.unit),
    unit_cost: line.unitCost ?? 0,
    line_name: line.name,
    department: 'PRODUCE',
    case_pack_size: 1,
    line_confidence: 0.95,
    supplier_code: line.code,
    printed_name: line.name,
    create_new: true,
  }));
}

test('confirming invoice 901452 creates SKUs and posts every shipped line once', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `901452-${Date.now()}`;
  const supplier = await prisma.supplier.create({ data: { name: `Tony Deodato ${stamp}` } });
  const staffId = `staff-${stamp}`;
  const fingerling = await prisma.product.create({
    data: {
      name: `Existing fingerling ${stamp}`,
      barcode: 'POFY25',
      department: 'PRODUCE',
      shelfLifeDays: 7,
    },
  });
  await prisma.supplierProductMatch.create({
    data: {
      supplierId: supplier.id,
      matchType: 'code',
      matchKey: 'POFY25',
      printedValue: 'POFY25',
      productId: fingerling.id,
      createdById: staffId,
      updatedById: staffId,
    },
  });
  const lines = commitLines();
  const fingerlingLine = lines.find((line) => line.supplier_code === 'POFY25');
  assert.ok(fingerlingLine);
  const draft = await saveInvoiceOcrDraft(staffId, {
    vendorName: 'Tony Deodato & Sons',
    invoiceNumber: '901452',
    invoiceDate: '2026-11-17',
    totalAmount: INVOICE_901452_TOTAL,
    departmentBreakdown: { PRODUCE: INVOICE_901452_TOTAL },
    lines: lines.map((line) => ({
      product_id: line.product_id,
      quantity: line.quantity,
      quantity_kind: line.quantity_kind,
      unit_cost: line.unit_cost,
      line_name: line.line_name,
      department: 'PRODUCE',
      case_pack_size: 1,
      line_confidence: 0.95,
      requires_approval: false,
      supplier_code: line.supplier_code,
      printed_name: line.printed_name,
      create_new: true,
    })),
  });

  t.after(async () => {
    const products = await prisma.product.findMany({
      where: { OR: [{ supplier: supplier.name }, { id: fingerling.id }] },
      select: { id: true },
    });
    const productIds = products.map((row) => row.id);
    const deliveries = await prisma.receivingDelivery.findMany({
      where: { catalogProductId: { in: productIds } },
      select: { id: true },
    });
    const deliveryIds = deliveries.map((row) => row.id);
    await prisma.ledgerIdempotencyKey.deleteMany({
      where: { key: { in: deliveryIds.map((id) => `recv:${id}`) } },
    });
    await prisma.receivingDelivery.deleteMany({ where: { id: { in: deliveryIds } } });
    await prisma.inventoryLot.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.invoiceLineItem.deleteMany({ where: { invoice: { supplierId: supplier.id } } });
    await prisma.vendorInvoice.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.supplierInvoiceDocument.deleteMany({ where: { supplierId: supplier.id } });
    await prisma.invoiceOcrDraft.deleteMany({ where: { staffId } });
    if (productIds.length > 0) await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });

  const input = {
    staffId,
    referenceId: '901452',
    draftId: draft.id,
    actorIsManager: true,
    confirmedItems: lines,
    invoiceMeta: {
      vendorName: 'Tony Deodato & Sons',
      supplierId: supplier.id,
      invoiceNumber: '901452',
      invoiceDate: '2026-11-17',
      totalAmount: INVOICE_901452_TOTAL,
      departmentBreakdown: { PRODUCE: INVOICE_901452_TOTAL },
    },
  };
  const committed = await commitInvoiceOcrReceipts(input);
  assert.equal(committed.transactionsCreated, INVOICE_901452_POSTED_LINES);
  const posted = committed.receipts.filter((row) => row.transactionId);
  assert.equal(posted.length, INVOICE_901452_POSTED_LINES);

  const productIds = [...new Set(committed.receipts.map((row) => row.productId).filter((id) => id))];
  assert.equal(productIds.length, INVOICE_901452_POSTED_LINES);
  const fingerlingIndex = lines.findIndex((line) => line.supplier_code === 'POFY25');
  assert.equal(committed.receipts[fingerlingIndex]?.productId, fingerling.id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, barcode: true },
  });
  assert.equal(products.find((row) => row.id === fingerling.id)?.barcode, 'POFY25');
  assert.equal(
    products.filter((row) => row.id !== fingerling.id).every((row) => row.barcode == null),
    true
  );
  const codeLinks = await prisma.supplierProductMatch.count({
    where: { supplierId: supplier.id, matchType: 'code', productId: { in: productIds } },
  });
  assert.equal(codeLinks, INVOICE_901452_POSTED_LINES);
  const transactions = await prisma.inventoryTransaction.findMany({
    where: { productId: { in: productIds }, transactionType: 'Receive' },
    select: { qtyChange: true, unitCostAtTime: true, productId: true },
  });
  assert.equal(transactions.length, INVOICE_901452_POSTED_LINES);
  const amount = Number(
    transactions.reduce((sum, row) => sum + row.qtyChange * row.unitCostAtTime, 0).toFixed(2)
  );
  assert.equal(amount, INVOICE_901452_TOTAL);
  const basilIndex = lines.findIndex((line) => line.supplier_code === 'BAS1F');
  const basilId = committed.receipts[basilIndex]?.productId;
  assert.equal(transactions.some((row) => row.productId === basilId), true);

  const again = await commitInvoiceOcrReceipts(input);
  assert.equal(again.transactionsCreated, 0);
  const afterReplay = await prisma.inventoryTransaction.count({
    where: { productId: { in: productIds }, transactionType: 'Receive' },
  });
  assert.equal(afterReplay, INVOICE_901452_POSTED_LINES);

  await assert.rejects(
    () =>
      commitInvoiceOcrReceipts({
        ...input,
        draftId: undefined,
        confirmedItems: lines.map((line) =>
          line.supplier_code === 'BAS1F' ? { ...line, unit_cost: line.unit_cost + 1 } : line
        ),
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes('Stock was not updated.'), false);
      assert.match(error.message, /different item, quantity, or cost/);
      return true;
    }
  );
  const afterConflict = await prisma.inventoryTransaction.count({
    where: { productId: { in: productIds }, transactionType: 'Receive' },
  });
  assert.equal(afterConflict, INVOICE_901452_POSTED_LINES);
});

test('a failed invoice receipt does not keep the products it created', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const sku = `RB${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const post: ReceivingLogPostInput = {
    itemName: `Rollback herb ${sku}`,
    supplierCode: sku,
    casesReceived: 1,
    caseCost: 5,
    packSize: 1,
    splitFactor: 1,
    retailUnit: 'units',
    marginMode: '40',
    currentRetailPrice: 0,
    department: 'PRODUCE',
    externalLogId: crypto.randomUUID(),
  };
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const posted = await postInvoiceReceiptBatch(tx, [post], { staffId: 'staff-rollback', supplierName: 'Dock' });
      assert.equal(posted.postedRows.length, 1);
      throw new Error('force rollback');
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'force rollback');
      return true;
    }
  );
  assert.equal(await prisma.product.count({ where: { barcode: sku } }), 0);
});
