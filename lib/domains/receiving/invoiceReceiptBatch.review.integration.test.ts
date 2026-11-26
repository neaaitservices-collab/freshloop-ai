import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { prisma } from '@/lib/domains/inventory/ledger';
import { commitInvoiceOcrReceipts, saveInvoiceOcrDraft } from '@/lib/domains/receiving/invoiceOcrCommit';
import { postInvoiceReceiptBatch } from '@/lib/domains/receiving/invoiceReceiptBatch';
import type { ReceivingLogPostInput } from '@/lib/domains/receiving/receivingLogPost';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

function line(overrides: Partial<ReceivingLogPostInput> & { remember?: boolean }): ReceivingLogPostInput {
  return {
    itemName: 'RED CABBAGE CASE',
    supplierCode: 'CAB4C',
    casesReceived: 1,
    caseCost: 22.75,
    packSize: 1,
    splitFactor: 1,
    retailUnit: 'units',
    marginMode: '40',
    currentRetailPrice: 0,
    department: 'PRODUCE',
    externalLogId: crypto.randomUUID(),
    ...overrides,
  };
}

async function cleanup(productIds: string[], supplierIds: string[]) {
  if (productIds.length > 0) {
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
    await prisma.supplierProductMatch.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  }
  if (supplierIds.length > 0) {
    await prisma.supplierInvoiceDocument.deleteMany({ where: { supplierId: { in: supplierIds } } });
    await prisma.supplier.deleteMany({ where: { id: { in: supplierIds } } });
  }
}

test('an existing name with no barcode is reused instead of copied', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `cabbage-${Date.now()}`;
  const cabbage = await prisma.product.create({
    data: {
      name: `RED CABBAGE CASE ${stamp}`,
      department: 'PRODUCE',
      supplier: 'Old dock',
      standardCost: 3,
      shelfLifeDays: 7,
    },
  });
  t.after(() => cleanup([cabbage.id], []));
  const posted = await prisma.$transaction((tx) =>
    postInvoiceReceiptBatch(
      tx,
      [
        line({
          itemName: `RED CABBAGE CASE ${stamp}`,
          supplierCode: `CAB${stamp.slice(-4).toUpperCase()}`,
          caseRetailPrice: 40,
        }),
      ],
      { staffId: 'staff-review', supplierName: 'Tony Deodato', supplierId: null }
    )
  );
  assert.equal(posted.postedRows[0]?.stock.posted, true);
  if (posted.postedRows[0]?.stock.posted) {
    assert.equal(posted.postedRows[0].stock.productId, cabbage.id);
  }
  const rows = await prisma.product.findMany({ where: { name: `RED CABBAGE CASE ${stamp}` } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.barcode, null);
  assert.equal(rows[0]?.id, cabbage.id);
  assert.equal(rows[0]?.caseRetailPrice, 40);
  assert.equal(rows[0]?.standardCost, 22.75);
});

test('another supplier barcode does not block confirm or take the receipt', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `basil-${Date.now()}`;
  const other = await prisma.supplier.create({ data: { name: `Other Market ${stamp}` } });
  const ours = await prisma.supplier.create({ data: { name: `Deodato ${stamp}` } });
  const basil = await prisma.product.create({
    data: {
      name: `West Coast Basil ${stamp}`,
      barcode: `BAS${stamp.slice(-6).toUpperCase()}`,
      department: 'PRODUCE',
      supplier: `Other Market ${stamp}`,
      standardCost: 1,
      shelfLifeDays: 7,
    },
  });
  const code = basil.barcode ?? '';
  const createdIds: string[] = [basil.id];
  t.after(() => cleanup(createdIds, [other.id, ours.id]));
  const posted = await prisma.$transaction((tx) =>
    postInvoiceReceiptBatch(tx, [line({ itemName: `BAG BASIL ${stamp}`, supplierCode: code })], {
      staffId: 'staff-review',
      supplierName: `Deodato ${stamp}`,
      supplierId: ours.id,
    })
  );
  assert.equal(posted.postedRows[0]?.stock.posted, true);
  const receivedId = posted.postedRows[0]?.stock.posted ? posted.postedRows[0].stock.productId : '';
  assert.notEqual(receivedId, basil.id);
  createdIds.push(receivedId);
  const kept = await prisma.product.findUnique({ where: { id: basil.id } });
  assert.equal(kept?.supplier, `Other Market ${stamp}`);
  assert.equal(kept?.standardCost, 1);
  assert.equal(kept?.barcode, code);
  assert.equal(await prisma.inventoryTransaction.count({ where: { productId: basil.id } }), 0);
  const created = await prisma.product.findUnique({ where: { id: receivedId } });
  assert.equal(created?.barcode, null);
  const link = await prisma.supplierProductMatch.findFirst({
    where: { supplierId: ours.id, matchType: 'code', matchKey: code },
  });
  assert.equal(link?.productId, receivedId);
});

test('a manufactured product holding the code does not block confirm', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `made-${Date.now()}`;
  const code = `MFG${stamp.slice(-6).toUpperCase()}`;
  const made = await prisma.product.create({
    data: {
      name: `Kitchen basil ${stamp}`,
      barcode: code,
      department: 'PRODUCE',
      isManufactured: true,
      standardCost: 4,
      shelfLifeDays: 7,
    },
  });
  const ours = await prisma.supplier.create({ data: { name: `Deodato made ${stamp}` } });
  const createdIds: string[] = [made.id];
  t.after(() => cleanup(createdIds, [ours.id]));
  const itemName = `BAG BASIL ${stamp}`;
  const posted = await prisma.$transaction((tx) =>
    postInvoiceReceiptBatch(tx, [line({ itemName, supplierCode: code })], {
      staffId: 'staff-review',
      supplierName: ours.name,
      supplierId: ours.id,
    })
  );
  assert.equal(posted.postedRows[0]?.stock.posted, true);
  const receivedId = posted.postedRows[0]?.stock.posted ? posted.postedRows[0].stock.productId : '';
  assert.notEqual(receivedId, made.id);
  createdIds.push(receivedId);
  const kept = await prisma.product.findUnique({ where: { id: made.id } });
  assert.equal(kept?.isManufactured, true);
  assert.equal(kept?.barcode, code);
  assert.equal(kept?.standardCost, 4);
  assert.equal(await prisma.inventoryTransaction.count({ where: { productId: made.id } }), 0);
  const link = await prisma.supplierProductMatch.findFirst({
    where: { supplierId: ours.id, matchType: 'code', matchKey: code },
  });
  assert.equal(link?.productId, receivedId);
});

test('a second invoice of the same codes reuses the products', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `twice-${Date.now()}`;
  const supplier = await prisma.supplier.create({ data: { name: `Deodato twice ${stamp}` } });
  const createdIds: string[] = [];
  t.after(() => cleanup(createdIds, [supplier.id]));
  const first = await prisma.$transaction((tx) =>
    postInvoiceReceiptBatch(
      tx,
      [
        line({ itemName: `Twice herb ${stamp}`, supplierCode: `TW${stamp.slice(-4).toUpperCase()}` }),
        line({ itemName: `Twice mint ${stamp}`, supplierCode: `TM${stamp.slice(-4).toUpperCase()}` }),
      ],
      { staffId: 'staff-review', supplierName: supplier.name, supplierId: supplier.id }
    )
  );
  const firstIds = first.postedRows.flatMap((row) => (row.stock.posted ? [row.stock.productId] : []));
  createdIds.push(...firstIds);
  const before = await prisma.product.count({ where: { id: { in: firstIds } } });
  const second = await prisma.$transaction((tx) =>
    postInvoiceReceiptBatch(
      tx,
      [
        line({ itemName: `Renamed herb ${stamp}`, supplierCode: `TW${stamp.slice(-4).toUpperCase()}` }),
        line({ itemName: `Renamed mint ${stamp}`, supplierCode: `TM${stamp.slice(-4).toUpperCase()}` }),
      ],
      { staffId: 'staff-review', supplierName: supplier.name, supplierId: supplier.id }
    )
  );
  const secondIds = second.postedRows.flatMap((row) => (row.stock.posted ? [row.stock.productId] : []));
  assert.deepEqual(secondIds.sort(), [...firstIds].sort());
  assert.equal(await prisma.product.count({ where: { id: { in: firstIds } } }), before);
  assert.equal(
    await prisma.supplierProductMatch.count({
      where: { supplierId: supplier.id, matchType: 'code', productId: { in: firstIds } },
    }),
    2
  );
});

test('a LEMONS 90/95 name tie creates no LEM95 link', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const token = `lx${Date.now().toString(36)}`;
  const supplier = await prisma.supplier.create({ data: { name: `Deodato lemons ${token}` } });
  const lemons = await Promise.all(
    ['LEMONS 90', 'LEMONS 95'].map((name) =>
      prisma.product.create({
        data: {
          name: `${name} ${token}`,
          department: 'PRODUCE',
          supplier: 'Old dock',
          standardCost: 4,
          shelfLifeDays: 7,
        },
      })
    )
  );
  const ids = lemons.map((row) => row.id);
  t.after(() => cleanup(ids, [supplier.id]));
  const invoiceName = `LEMONS 90/95 ${token}`;
  const posted = await prisma.$transaction((tx) =>
    postInvoiceReceiptBatch(tx, [line({ itemName: invoiceName, supplierCode: 'LEM95' })], {
      staffId: 'staff-review',
      supplierName: supplier.name,
      supplierId: supplier.id,
    })
  );
  const receivedId = posted.postedRows[0]?.stock.posted ? posted.postedRows[0].stock.productId : '';
  const keptId = [...ids].sort()[0];
  assert.equal(receivedId, keptId);
  assert.equal(await prisma.product.count({ where: { name: invoiceName } }), 0);
  assert.equal(
    await prisma.supplierProductMatch.count({
      where: { supplierId: supplier.id, matchType: 'code', matchKey: 'LEM95' },
    }),
    0
  );
});

test('Kale with remember unticked creates no link', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const token = `kx${Date.now().toString(36)}`;
  const supplier = await prisma.supplier.create({ data: { name: `Deodato kale ${token}` } });
  const kale = await prisma.product.create({
    data: {
      name: `Kale ${token}`,
      department: 'PRODUCE',
      supplier: 'Old dock',
      standardCost: 3,
      shelfLifeDays: 7,
    },
  });
  t.after(() => cleanup([kale.id], [supplier.id]));
  const posted = await prisma.$transaction((tx) =>
    postInvoiceReceiptBatch(
      tx,
      [line({ itemName: `Kale ${token}`, supplierCode: `KA${token.slice(-4).toUpperCase()}`, remember: false })],
      { staffId: 'staff-review', supplierName: supplier.name, supplierId: supplier.id }
    )
  );
  assert.equal(posted.postedRows[0]?.stock.posted, true);
  if (posted.postedRows[0]?.stock.posted) {
    assert.equal(posted.postedRows[0].stock.productId, kale.id);
  }
  assert.equal(
    await prisma.supplierProductMatch.count({
      where: { supplierId: supplier.id, matchType: 'code' },
    }),
    0
  );
});

test('Kale with remember ticked saves the code link', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const token = `kr${Date.now().toString(36)}`;
  const code = `KR${token.slice(-4).toUpperCase()}`;
  const supplier = await prisma.supplier.create({ data: { name: `Deodato kale remember ${token}` } });
  const kale = await prisma.product.create({
    data: {
      name: `Kale ${token}`,
      department: 'PRODUCE',
      supplier: 'Old dock',
      standardCost: 3,
      shelfLifeDays: 7,
    },
  });
  t.after(() => cleanup([kale.id], [supplier.id]));
  const posted = await prisma.$transaction((tx) =>
    postInvoiceReceiptBatch(tx, [line({ itemName: `Kale ${token}`, supplierCode: code, remember: true })], {
      staffId: 'staff-review',
      supplierName: supplier.name,
      supplierId: supplier.id,
    })
  );
  const receivedId = posted.postedRows[0]?.stock.posted ? posted.postedRows[0].stock.productId : '';
  assert.equal(receivedId, kale.id);
  const link = await prisma.supplierProductMatch.findFirst({
    where: { supplierId: supplier.id, matchType: 'code', matchKey: code },
  });
  assert.equal(link?.productId, kale.id);
});

test('a new product still gets its link and is reused on a second invoice', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const token = `nx${Date.now().toString(36)}`;
  const code = `NW${token.slice(-6).toUpperCase()}`;
  const supplier = await prisma.supplier.create({ data: { name: `Deodato new ${token}` } });
  const createdIds: string[] = [];
  t.after(() => cleanup(createdIds, [supplier.id]));
  const first = await prisma.$transaction((tx) =>
    postInvoiceReceiptBatch(tx, [line({ itemName: `New herb ${token}`, supplierCode: code })], {
      staffId: 'staff-review',
      supplierName: supplier.name,
      supplierId: supplier.id,
    })
  );
  const productId = first.postedRows[0]?.stock.posted ? first.postedRows[0].stock.productId : '';
  assert.ok(productId);
  createdIds.push(productId);
  const link = await prisma.supplierProductMatch.findFirst({
    where: { supplierId: supplier.id, matchType: 'code', matchKey: code },
  });
  assert.equal(link?.productId, productId);
  const second = await prisma.$transaction((tx) =>
    postInvoiceReceiptBatch(tx, [line({ itemName: `Renamed herb ${token}`, supplierCode: code })], {
      staffId: 'staff-review',
      supplierName: supplier.name,
      supplierId: supplier.id,
    })
  );
  const reusedId = second.postedRows[0]?.stock.posted ? second.postedRows[0].stock.productId : '';
  assert.equal(reusedId, productId);
  assert.equal(await prisma.product.count({ where: { id: productId } }), 1);
  assert.equal(
    await prisma.supplierProductMatch.count({
      where: { supplierId: supplier.id, matchType: 'code', matchKey: code },
    }),
    1
  );
});

test('a blank name is not saved as a product', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `blank-${Date.now()}`;
  const supplier = await prisma.supplier.create({ data: { name: `Deodato blank ${stamp}` } });
  const createdIds: string[] = [];
  t.after(() => cleanup(createdIds, [supplier.id]));
  const posted = await prisma.$transaction((tx) =>
    postInvoiceReceiptBatch(
      tx,
      [line({ itemName: '   ', supplierCode: `BL${stamp.slice(-4).toUpperCase()}` }), line({ itemName: `Named ${stamp}`, supplierCode: `NM${stamp.slice(-4).toUpperCase()}` })],
      { staffId: 'staff-review', supplierName: supplier.name, supplierId: supplier.id }
    )
  );
  assert.equal(posted.postedRows.length, 1);
  const id = posted.postedRows[0]?.stock.posted ? posted.postedRows[0].stock.productId : '';
  createdIds.push(id);
  assert.equal(await prisma.product.count({ where: { name: '' } }), 0);
  assert.equal((await prisma.product.findUnique({ where: { id } }))?.name, `Named ${stamp}`);
});

test('a post-commit failure still leaves the receipt in place', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `after-${Date.now()}`;
  const supplier = await prisma.supplier.create({ data: { name: `Deodato after ${stamp}` } });
  const staffId = `staff-${stamp}`;
  const createdIds: string[] = [];
  t.after(async () => {
    await prisma.invoiceOcrDraft.deleteMany({ where: { staffId } });
    await cleanup(createdIds, [supplier.id]);
  });
  const draft = await saveInvoiceOcrDraft(staffId, {
    vendorName: supplier.name,
    invoiceNumber: `AFTER-${stamp}`,
    invoiceDate: '2026-11-17',
    totalAmount: 5,
    departmentBreakdown: { PRODUCE: 5 },
    lines: [
      {
        product_id: '',
        quantity: 1,
        quantity_kind: 'units',
        unit_cost: 5,
        line_name: `After herb ${stamp}`,
        department: 'PRODUCE',
        line_confidence: 0.95,
        requires_approval: false,
        supplier_code: `AF${stamp.slice(-4).toUpperCase()}`,
      },
    ],
  });
  const committed = await commitInvoiceOcrReceipts({
    staffId,
    referenceId: `AFTER-${stamp}`,
    draftId: draft.id,
    actorIsManager: true,
    confirmedItems: [
      {
        product_id: '',
        quantity: 1,
        unit_cost: 5,
        line_name: `After herb ${stamp}`,
        department: 'PRODUCE',
        line_confidence: 0.95,
        supplier_code: `AF${stamp.slice(-4).toUpperCase()}`,
        create_new: true,
      },
    ],
    invoiceMeta: {
      vendorName: supplier.name,
      supplierId: supplier.id,
      invoiceNumber: `AFTER-${stamp}`,
      invoiceDate: '2026-11-17',
      totalAmount: 5,
      departmentBreakdown: { PRODUCE: 5 },
    },
    afterCommit: () => {
      throw new Error('cache bus down');
    },
  });
  assert.equal(committed.transactionsCreated, 1);
  const productId = committed.receipts[0]?.productId ?? '';
  createdIds.push(productId);
  assert.equal(await prisma.inventoryTransaction.count({ where: { productId, transactionType: 'Receive' } }), 1);
});
