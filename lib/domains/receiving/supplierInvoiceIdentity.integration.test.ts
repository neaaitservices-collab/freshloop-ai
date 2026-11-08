import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryLocation } from '@prisma/client';
import { InventoryLedgerError, getCurrentStock, prisma } from '@/lib/domains/inventory/ledger';
import { postReceivingLogToInventory } from '@/lib/domains/receiving/receivingLogPost';
import {
  commitInvoiceOcrReceipts,
  saveInvoiceOcrDraft,
} from '@/lib/domains/receiving/invoiceOcrCommit';
import {
  SUPPLIER_REQUIRED_ERROR,
  resolveSupplierInvoice,
} from '@/lib/domains/receiving/supplierInvoiceIdentity';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

test('supplier invoice identity is shared by the board and OCR commit', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `inv-${Date.now()}`;
  const supplierA = await prisma.supplier.create({ data: { name: `North ${stamp}` } });
  const supplierB = await prisma.supplier.create({ data: { name: `South ${stamp}` } });
  const bananas = await prisma.product.create({
    data: { name: `Bananas ${stamp}`, department: 'PRODUCE', standardCost: 1, retailPrice: 2, shelfLifeDays: 4 },
  });
  const pears = await prisma.product.create({
    data: { name: `Pears ${stamp}`, department: 'PRODUCE', standardCost: 1, retailPrice: 2, shelfLifeDays: 4 },
  });

  t.after(async () => {
    const productIds = [bananas.id, pears.id];
    const deliveries = await prisma.receivingDelivery.findMany({
      where: { catalogProductId: { in: productIds } },
      select: { id: true },
    });
    const deliveryIds = deliveries.map((row) => row.id);
    await prisma.ledgerIdempotencyKey.deleteMany({
      where: { key: { in: deliveryIds.map((id) => `recv:${id}`) } },
    });
    await prisma.receivingDelivery.deleteMany({ where: { id: { in: deliveryIds } } });
    await prisma.supplierInvoiceDocument.deleteMany({
      where: { supplierId: { in: [supplierA.id, supplierB.id] } },
    });
    await prisma.invoiceLineItem.deleteMany({
      where: { invoice: { supplierId: { in: [supplierA.id, supplierB.id] } } },
    });
    await prisma.vendorInvoice.deleteMany({
      where: { supplierId: { in: [supplierA.id, supplierB.id] } },
    });
    await prisma.invoiceOcrDraft.deleteMany({ where: { staffId: `staff-${stamp}` } });
    await prisma.inventoryLot.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.supplier.deleteMany({ where: { id: { in: [supplierA.id, supplierB.id] } } });
  });

  const missing = await resolveSupplierInvoice({
    supplierId: '',
    invoiceNumber: '1001',
    lines: [{ printedName: `Bananas ${stamp}` }],
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.code, 'SUPPLIER_REQUIRED');
    assert.equal(missing.error, SUPPLIER_REQUIRED_ERROR);
  }
  const unknown = await resolveSupplierInvoice({
    supplierId: 'missing-supplier',
    invoiceNumber: '1001',
    lines: [{ printedName: `Bananas ${stamp}` }],
  });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.code, 'SUPPLIER_UNKNOWN');

  const slash = await resolveSupplierInvoice({
    supplierId: supplierA.id,
    invoiceNumber: '1001/A',
    invoiceDate: '2024-01-02',
    lines: [{ printedName: `Bananas ${stamp}` }],
  });
  const hyphen = await resolveSupplierInvoice({
    supplierId: supplierA.id,
    invoiceNumber: '1001-A',
    invoiceDate: '2024-01-02',
    lines: [{ printedName: `Bananas ${stamp}` }],
  });
  assert.equal(slash.ok, true);
  assert.equal(hyphen.ok, true);
  if (!slash.ok || !hyphen.ok) return;
  assert.notEqual(slash.lines[0]?.deliveryId, hyphen.lines[0]?.deliveryId);

  const laterYear = await resolveSupplierInvoice({
    supplierId: supplierA.id,
    invoiceNumber: '1001/A',
    invoiceDate: '2026-11-08',
    lines: [{ printedName: `Bananas ${stamp}` }],
  });
  assert.equal(laterYear.ok, true);
  if (!laterYear.ok) return;
  assert.equal(laterYear.lines[0]?.deliveryId, slash.lines[0]?.deliveryId);
  const dated = await prisma.supplierInvoiceDocument.findFirst({
    where: { supplierId: supplierA.id, invoiceKey: '1001/a' },
  });
  assert.equal(dated?.invoiceDate, '2024-01-02');

  const otherSupplier = await resolveSupplierInvoice({
    supplierId: supplierB.id,
    invoiceNumber: '1001/A',
    invoiceDate: '2025-05-05',
    lines: [{ printedName: `Bananas ${stamp}` }],
  });
  assert.equal(otherSupplier.ok, true);
  if (!otherSupplier.ok) return;
  assert.notEqual(otherSupplier.lines[0]?.deliveryId, slash.lines[0]?.deliveryId);

  const matched = await postReceivingLogToInventory(
    {
      itemName: `Bananas ${stamp}`,
      productId: bananas.id,
      casesReceived: 2,
      caseCost: 3,
      packSize: 1,
      splitFactor: 1,
      retailUnit: 'units',
      marginMode: '40',
      currentRetailPrice: 0,
      externalLogId: slash.lines[0]!.deliveryId,
      supplierId: supplierA.id,
    },
    `staff-${stamp}`,
    null
  );
  const otherPosted = await postReceivingLogToInventory(
    {
      itemName: `Bananas ${stamp}`,
      productId: bananas.id,
      casesReceived: 2,
      caseCost: 3,
      packSize: 1,
      splitFactor: 1,
      retailUnit: 'units',
      marginMode: '40',
      currentRetailPrice: 0,
      externalLogId: otherSupplier.lines[0]!.deliveryId,
      supplierId: supplierB.id,
    },
    `staff-${stamp}`,
    null
  );
  assert.equal(matched.stock.posted, true);
  assert.equal(otherPosted.stock.posted, true);
  assert.equal(await getCurrentStock(bananas.id, InventoryLocation.Retail_Floor), 4);

  const rematch = await resolveSupplierInvoice({
    supplierId: supplierA.id,
    invoiceNumber: '1001/A',
    lines: [{ printedName: `Bananas ${stamp}` }],
  });
  assert.equal(rematch.ok, true);
  if (!rematch.ok) return;
  assert.equal(rematch.lines[0]?.deliveryId, slash.lines[0]?.deliveryId);
  const changedProduct = await postReceivingLogToInventory(
    {
      itemName: `Bananas ${stamp}`,
      productId: pears.id,
      casesReceived: 2,
      caseCost: 3,
      packSize: 1,
      splitFactor: 1,
      retailUnit: 'units',
      marginMode: '40',
      currentRetailPrice: 0,
      externalLogId: rematch.lines[0]!.deliveryId,
      supplierId: supplierA.id,
    },
    `staff-${stamp}`,
    null
  );
  assert.equal(changedProduct.stock.posted, false);
  if (!changedProduct.stock.posted) assert.equal(changedProduct.stock.conflict, true);
  const unmatched = await postReceivingLogToInventory(
    {
      itemName: `Bananas ${stamp}`,
      casesReceived: 2,
      caseCost: 3,
      packSize: 1,
      splitFactor: 1,
      retailUnit: 'units',
      marginMode: '40',
      currentRetailPrice: 0,
      externalLogId: rematch.lines[0]!.deliveryId,
      supplierId: supplierA.id,
    },
    `staff-${stamp}`,
    null
  );
  assert.equal(unmatched.stock.posted, false);
  const replay = await postReceivingLogToInventory(
    {
      itemName: `Bananas ${stamp}`,
      productId: bananas.id,
      casesReceived: 2,
      caseCost: 3,
      packSize: 1,
      splitFactor: 1,
      retailUnit: 'units',
      marginMode: '40',
      currentRetailPrice: 0,
      externalLogId: rematch.lines[0]!.deliveryId,
      supplierId: supplierA.id,
    },
    `staff-${stamp}`,
    null
  );
  assert.equal(replay.stock.posted, true);
  if (replay.stock.posted) assert.equal(replay.stock.idempotent, true);
  assert.equal(await getCurrentStock(bananas.id, InventoryLocation.Retail_Floor), 4);
  assert.equal(await getCurrentStock(pears.id, InventoryLocation.Retail_Floor), 0);

  const drifted = await resolveSupplierInvoice({
    supplierId: supplierA.id,
    invoiceNumber: '1001/A',
    lines: [{ printedName: `Not the printed bananas ${stamp}` }],
  });
  assert.equal(drifted.ok, false);
  if (!drifted.ok) assert.equal(drifted.code, 'LINE_MISMATCH');
  const storedLines = await prisma.supplierInvoiceLine.count({
    where: { document: { supplierId: supplierA.id, invoiceKey: '1001/a' } },
  });
  assert.equal(storedLines, 1);

  const draft = await saveInvoiceOcrDraft(`staff-${stamp}`, {
    vendorName: `North ${stamp}`,
    invoiceNumber: '1001/A',
    invoiceDate: '2026-11-08',
    totalAmount: 6,
    departmentBreakdown: { PRODUCE: 6 },
    lines: [
      {
        product_id: bananas.id,
        quantity: 2,
        quantity_kind: 'units',
        unit_cost: 3,
        line_name: `Bananas ${stamp}`,
        department: 'PRODUCE',
        line_confidence: 0.95,
        requires_approval: false,
      },
    ],
  });
  const commitInput = {
    staffId: `staff-${stamp}`,
    referenceId: `1001/A-${stamp}`,
    draftId: draft.id,
    actorIsManager: false,
    confirmedItems: [
      {
        product_id: bananas.id,
        quantity: 2,
        quantity_kind: 'units' as const,
        unit_cost: 3,
        line_name: `Bananas ${stamp}`,
        department: 'PRODUCE' as const,
        line_confidence: 0.95,
      },
    ],
    invoiceMeta: {
      vendorName: `Printed vendor ${stamp}`,
      supplierId: supplierA.id,
      invoiceNumber: '1001/A',
      invoiceDate: '2026-11-08',
      totalAmount: 6,
      departmentBreakdown: { PRODUCE: 6 },
    },
  };
  const boardThenCommit = await commitInvoiceOcrReceipts(commitInput);
  assert.equal(boardThenCommit.transactionsCreated, 0);
  assert.equal(await getCurrentStock(bananas.id, InventoryLocation.Retail_Floor), 4);
  const rescannedCommit = await commitInvoiceOcrReceipts(commitInput);
  assert.equal(rescannedCommit.transactionsCreated, 0);
  assert.equal(
    await prisma.vendorInvoice.count({ where: { supplierId: supplierA.id, invoiceNumber: '1001/A' } }),
    0
  );

  const freshNumber = `INV-${stamp}`;
  const freshDraft = await saveInvoiceOcrDraft(`staff-${stamp}`, {
    vendorName: `South ${stamp}`,
    invoiceNumber: freshNumber,
    invoiceDate: '2026-02-02',
    totalAmount: 4,
    departmentBreakdown: { PRODUCE: 4 },
    lines: [
      {
        product_id: pears.id,
        quantity: 2,
        quantity_kind: 'units',
        unit_cost: 2,
        line_name: `Pears ${stamp}`,
        department: 'PRODUCE',
        line_confidence: 0.95,
        requires_approval: false,
      },
    ],
  });
  const firstCommit = await commitInvoiceOcrReceipts({
    staffId: `staff-${stamp}`,
    referenceId: freshNumber,
    draftId: freshDraft.id,
    confirmedItems: [
      {
        product_id: pears.id,
        quantity: 2,
        quantity_kind: 'units',
        unit_cost: 2,
        line_name: `Pears ${stamp}`,
        department: 'PRODUCE',
      },
    ],
    invoiceMeta: {
      vendorName: `Different printed vendor ${stamp}`,
      supplierId: supplierB.id,
      invoiceNumber: freshNumber,
      invoiceDate: '2026-02-02',
      totalAmount: 4,
      departmentBreakdown: { PRODUCE: 4 },
    },
  });
  assert.equal(firstCommit.transactionsCreated, 1);
  const committedLine = await resolveSupplierInvoice({
    supplierId: supplierB.id,
    invoiceNumber: freshNumber,
    invoiceDate: '2027-01-01',
    lines: [{ printedName: `Pears ${stamp}` }],
  });
  assert.equal(committedLine.ok, true);
  if (!committedLine.ok) return;
  const commitThenBoard = await postReceivingLogToInventory(
    {
      itemName: `Pears ${stamp}`,
      productId: pears.id,
      casesReceived: 2,
      caseCost: 2,
      packSize: 1,
      splitFactor: 1,
      retailUnit: 'units',
      marginMode: '40',
      currentRetailPrice: 0,
      externalLogId: committedLine.lines[0]!.deliveryId,
      supplierId: supplierB.id,
    },
    `staff-${stamp}`,
    null
  );
  assert.equal(commitThenBoard.stock.posted, true);
  if (commitThenBoard.stock.posted) assert.equal(commitThenBoard.stock.idempotent, true);
  assert.equal(await getCurrentStock(pears.id, InventoryLocation.Retail_Floor), 2);
  const secondFresh = await commitInvoiceOcrReceipts({
    staffId: `staff-${stamp}`,
    referenceId: freshNumber,
    draftId: freshDraft.id,
    confirmedItems: [
      {
        product_id: pears.id,
        quantity: 2,
        quantity_kind: 'units',
        unit_cost: 2,
        line_name: `Pears ${stamp}`,
        department: 'PRODUCE',
      },
    ],
    invoiceMeta: {
      vendorName: `Different printed vendor ${stamp}`,
      supplierId: supplierB.id,
      invoiceNumber: freshNumber,
      invoiceDate: '2027-01-01',
      totalAmount: 4,
      departmentBreakdown: { PRODUCE: 4 },
    },
  });
  assert.equal(secondFresh.transactionsCreated, 0);
  assert.equal(await getCurrentStock(pears.id, InventoryLocation.Retail_Floor), 2);
  assert.equal(
    await prisma.vendorInvoice.count({ where: { supplierId: supplierB.id, invoiceNumber: freshNumber } }),
    1
  );
  const keptDate = await prisma.supplierInvoiceDocument.findFirst({
    where: { supplierId: supplierB.id, invoiceKey: freshNumber.toLowerCase() },
  });
  assert.equal(keptDate?.invoiceDate, '2026-02-02');

  let blocked = false;
  try {
    await commitInvoiceOcrReceipts({
      ...commitInput,
      invoiceMeta: { ...commitInput.invoiceMeta, supplierId: '' },
    });
  } catch (error) {
    blocked = error instanceof InventoryLedgerError && error.message === SUPPLIER_REQUIRED_ERROR;
  }
  assert.equal(blocked, true);
});
