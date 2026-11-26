import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryLocation, TransactionType } from '@prisma/client';
import {
  confirmCsvSales,
  loadCsvColumnMapping,
  previewCsvSales,
  saveCsvColumnMapping,
} from '@/lib/domains/inventory/csvSalesImport';
import { squareItemsDetailCsv } from '@/lib/domains/inventory/csvSalesParse';
import {
  calculateRealTimeWastePct,
  executeBundleSale,
  getCurrentStock,
  prisma,
} from '@/lib/domains/inventory/ledger';
import { recordProductSale } from '@/lib/domains/inventory/recordSale';
import { sumRecognizedGrossSales } from '@/lib/domains/inventory/saleRevenue';
import { postProductReceipt } from '@/lib/domains/inventory/stock';
import { torontoRange, torontoYmd } from '@/lib/domains/stats/storeTime';
import { csvColumnMappingSchema } from '@/lib/security/schemas/csvSalesImport';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';

/** True only for the CI database named freshloop_ci. Any other DATABASE_URL skips. */
function isFreshloopCiTestDatabase(url: string, dbTestsFlag: string | undefined): boolean {
  if (!url.trim() || dbTestsFlag === '0') return false;
  try {
    const database = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
    return database === 'freshloop_ci';
  } catch {
    return false;
  }
}

const hasCiDb = isFreshloopCiTestDatabase(databaseUrl, process.env.FRESHLOOP_DB_TESTS);

test(
  'weekly CSV posts each Toronto date once and an overlap posts nothing new (freshloop_ci)',
  { skip: !hasCiDb },
  async (t) => {
    try {
      await prisma.$connect();
    } catch {
      t.skip('Isolated database unreachable.');
      return;
    }

    const stamp = `csv-${Date.now()}`;
    const storeId = `csv-store-${stamp}`;
    const sku = `BANANA-${stamp}`;
    const product = await prisma.product.create({
      data: {
        name: `CSV Banana ${stamp}`,
        department: 'PRODUCE',
        standardCost: 1,
        retailPrice: 10,
        targetMargin: 0.4,
        shelfLifeDays: 7,
      },
    });
    const mappingRow = await prisma.pOSMapping.create({
      data: { externalSku: sku, posSystem: 'DEFAULT', productId: product.id, isActive: true },
    });
    const bundle = await prisma.bundle.create({
      data: {
        name: `CSV Bundle ${stamp}`,
        bundleSku: `CSV-B-${stamp}`,
        bundlePrice: 50,
        isActive: true,
        items: { create: [{ productId: product.id, quantity: 1 }] },
      },
    });

    t.after(async () => {
      await prisma.ledgerIdempotencyKey.deleteMany({ where: { key: { contains: stamp } } });
      await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
      await prisma.inventoryTransaction.deleteMany({ where: { productId: product.id } });
      await prisma.pOSMapping.deleteMany({
        where: { OR: [{ id: mappingRow.id }, { posSystem: `CSV_COLUMNS:${storeId}` }] },
      });
      await prisma.bundleItem.deleteMany({ where: { bundleId: bundle.id } });
      await prisma.bundle.delete({ where: { id: bundle.id } });
      await prisma.product.delete({ where: { id: product.id } });
    });

    await postProductReceipt({
      productId: product.id,
      quantityUnits: 40,
      unitCostAtTime: 1,
      staffId: 'test-staff',
      referenceId: `RCV-${stamp}`,
    });

    const saved = await saveCsvColumnMapping(
      storeId,
      csvColumnMappingSchema.parse({
        sku: 'PLU',
        qty: 'Qty',
        unit: 'Unit',
        revenue: 'Amount',
        date: 'Sold',
      })
    );
    const loaded = await loadCsvColumnMapping(storeId);
    assert.deepEqual(loaded, saved);

    const line = (
      date: string,
      txn: string,
      qty: string,
      net: string,
      event = 'Payment'
    ) => ({
      Date: date,
      Item: 'Synthetic Banana',
      Qty: qty,
      'Price Point Name': 'Bunch',
      SKU: sku,
      'Gross Sales': net,
      'Net Sales': net,
      Unit: 'lb',
      'Transaction ID': txn,
      'Event Type': event,
    });

    const weekCsv = squareItemsDetailCsv([
      line('08/01/2098', `T1-${stamp}`, '2', '$12.50'),
      line('08/02/2098', `T2-${stamp}`, '1', '$1,234.50'),
      line('08/03/2098', `T3-${stamp}`, '1', '$10.00'),
      line('08/04/2098', `T4-${stamp}`, '1', '$8.00'),
      line('08/05/2098', `T5-${stamp}`, '1', '$6.00'),
      line('08/06/2098', `T6-${stamp}`, '1', '$5.00'),
      line('08/07/2098', `T7-${stamp}`, '1', '$4.00'),
      {
        ...line('08/07/2098', `UNK-${stamp}`, '1', '$3.00'),
        SKU: 'UNKNOWN-PLU',
        Item: 'Synthetic Mystery',
      },
      line('08/07/2098', `BADQ-${stamp}`, 'abc', '$1.00'),
      line('08/07/2098', `NEG-${stamp}`, '-1', '$1.00'),
      line('not-a-date', `DATE-${stamp}`, '1', '$1.00'),
      line('08/07/2098', `REV-${stamp}`, '1', 'n/a'),
    ]);

    const before = await prisma.inventoryTransaction.count({
      where: { productId: product.id, transactionType: TransactionType.Sale },
    });
    const placeholder = csvColumnMappingSchema.parse({
      sku: 'SKU',
      qty: 'Qty',
      unit: 'Unit',
      revenue: 'Net Sales',
      date: 'Date',
    });
    const preview = await previewCsvSales({ csv: weekCsv, mapping: placeholder, storeId });
    assert.equal(preview.preset, 'square-items-detail');
    assert.deepEqual(preview.dateRange, { from: '2098-08-01', to: '2098-08-07' });
    assert.equal(preview.days.length, 7);
    assert.equal(preview.unknown.length, 1);
    assert.ok(preview.bad.length >= 3);
    const afterPreview = await prisma.inventoryTransaction.count({
      where: { productId: product.id, transactionType: TransactionType.Sale },
    });
    assert.equal(afterPreview, before);

    const first = await confirmCsvSales({
      csv: weekCsv,
      mapping: placeholder,
      storeId,
      staffId: 'test-staff',
    });
    assert.equal(first.posted, 7);
    assert.equal(first.failed.length, 0);
    const sales = await prisma.inventoryTransaction.findMany({
      where: { productId: product.id, transactionType: TransactionType.Sale },
    });
    assert.equal(sales.length, before + 7);
    assert.ok(sales.every((row) => row.fromLocation === InventoryLocation.Retail_Floor));
    assert.ok(sales.every((row) => row.toLocation === InventoryLocation.Customer_Out));
    const revenues = sales.map((row) => row.realizedLineRevenue).sort((a, b) => (a ?? 0) - (b ?? 0));
    assert.deepEqual(revenues, [4, 5, 6, 8, 10, 12.5, 1234.5]);
    const postedDates = new Set(sales.map((row) => torontoYmd(row.timestamp)));
    assert.deepEqual(
      [...postedDates].sort(),
      ['2098-08-01', '2098-08-02', '2098-08-03', '2098-08-04', '2098-08-05', '2098-08-06', '2098-08-07']
    );
    assert.equal(
      await prisma.ledgerIdempotencyKey.count({ where: { key: { contains: `UNK-${stamp}` } } }),
      0
    );
    assert.equal(
      await prisma.ledgerIdempotencyKey.count({ where: { key: { contains: `BADQ-${stamp}` } } }),
      0
    );

    const floor = await getCurrentStock(product.id, InventoryLocation.Retail_Floor);
    const second = await confirmCsvSales({
      csv: weekCsv,
      mapping: placeholder,
      storeId,
      staffId: 'test-staff',
    });
    assert.equal(second.posted, 0);
    assert.equal(second.preview.duplicate.length, 7);
    assert.equal(
      await prisma.inventoryTransaction.count({
        where: { productId: product.id, transactionType: TransactionType.Sale },
      }),
      sales.length
    );
    assert.equal(await getCurrentStock(product.id, InventoryLocation.Retail_Floor), floor);

    const overlap = squareItemsDetailCsv([
      line('08/08/2098', `T8-${stamp}`, '1', '$9.00'),
      line('08/05/2098', `T5-${stamp}`, '1', '$6.00'),
      line('08/01/2098', `T1-${stamp}`, '2', '$12.50'),
    ]);
    const overlapped = await confirmCsvSales({
      csv: overlap,
      mapping: placeholder,
      storeId,
      staffId: 'test-staff',
    });
    assert.equal(overlapped.posted, 1);
    assert.equal(overlapped.preview.duplicate.length, 2);
    const newest = await prisma.inventoryTransaction.findFirst({
      where: { productId: product.id, realizedLineRevenue: 9 },
    });
    assert.equal(newest?.transactionType, TransactionType.Sale);
    assert.equal(newest ? torontoYmd(newest.timestamp) : '', '2098-08-08');

    const original = sales.find((row) => row.realizedLineRevenue === 12.5);
    assert.ok(original?.referenceId);
    const replay = await recordProductSale({
      productId: product.id,
      quantity: 2,
      staffId: 'test-staff',
      location: 'floor',
      lineRevenue: 12.5,
      soldAt: original.timestamp,
      referenceId: original.referenceId ?? undefined,
      idempotencyKey: original.referenceId ?? undefined,
    });
    assert.equal(replay.idempotent, true);

    const wasteDay = '2097-04-17';
    const wasteCsv = squareItemsDetailCsv([
      line('04/17/2097', `WASTE-${stamp}`, '1', '$200.00'),
    ]);
    const wastePost = await confirmCsvSales({
      csv: wasteCsv,
      mapping: placeholder,
      storeId,
      staffId: 'test-staff',
    });
    assert.equal(wastePost.posted, 1);
    const wasteSale = await prisma.inventoryTransaction.findFirst({
      where: { productId: product.id, realizedLineRevenue: 200 },
    });
    assert.ok(wasteSale);
    await prisma.inventoryTransaction.create({
      data: {
        productId: product.id,
        staffId: 'test-staff',
        qtyChange: -1,
        transactionType: TransactionType.Waste,
        fromLocation: InventoryLocation.Retail_Floor,
        toLocation: InventoryLocation.Waste_Bin,
        unitCostAtTime: 20,
        timestamp: wasteSale.timestamp,
        referenceId: `WASTE-ROW-${stamp}`,
      },
    });
    const bundleSale = await executeBundleSale(bundle.bundleSku, `BDL-${stamp}`, {
      staffId: 'test-staff',
      quantitySold: 1,
    });
    await prisma.inventoryTransaction.updateMany({
      where: { id: { in: bundleSale.transactions.map((row) => row.id) } },
      data: { timestamp: wasteSale.timestamp },
    });
    const range = torontoRange(wasteDay, wasteDay);
    const windowSales = await prisma.inventoryTransaction.findMany({
      where: {
        transactionType: { in: [TransactionType.Sale, TransactionType.POS_Sale] },
        qtyChange: { lt: 0 },
        timestamp: { gte: range.startUtc, lt: range.endUtc },
      },
      select: { transactionType: true, qtyChange: true, realizedLineRevenue: true, productId: true },
    });
    const ours = windowSales.filter((row) => row.productId === product.id);
    const recognized = sumRecognizedGrossSales(ours);
    const kpi = await calculateRealTimeWastePct({
      startDate: range.startUtc,
      endDate: range.endUtc,
      endExclusive: true,
    });
    assert.equal(recognized.grossSalesRevenue, 250);
    assert.ok(ours.some((row) => row.transactionType === TransactionType.POS_Sale));
    assert.ok(ours.some((row) => row.realizedLineRevenue === 200));
    assert.equal(kpi.grossSalesRevenue, recognized.grossSalesRevenue);
    assert.equal(kpi.totalDiscardValue, 20);
  }
);
