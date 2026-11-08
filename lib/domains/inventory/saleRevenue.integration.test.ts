import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryLocation, TransactionType } from '@prisma/client';
import { calculateRealTimeWastePct, executeBundleSale, prisma } from '@/lib/domains/inventory/ledger';
import { recordProductSale } from '@/lib/domains/inventory/recordSale';
import { postProductReceipt } from '@/lib/domains/inventory/stock';
import { rebuildLotsFromLedger } from '@/lib/domains/inventory/rebuildLots';
import { sumRecognizedGrossSales } from '@/lib/domains/inventory/saleRevenue';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';

function isolatedLoopbackDatabase(url: string): boolean {
  if (!url || process.env.FRESHLOOP_DB_TESTS === '0' || url.includes('freshloop_ci')) return false;
  const lower = url.toLowerCase();
  if (lower.includes('supabase') || lower.includes('pooler.supabase') || lower.includes('amazonaws')) {
    return false;
  }
  try {
    const hostname = new URL(url).hostname;
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}

const hasIsolatedDb = isolatedLoopbackDatabase(databaseUrl);

const WINDOW_AT = new Date('2099-03-01T12:00:00.000Z');
const WINDOW_START = new Date('2099-03-01T00:00:00.000Z');
const WINDOW_END = new Date('2099-03-01T23:59:59.999Z');

test(
  'recorded sale revenue and waste denominator ignore later shelf prices (isolated DB)',
  { skip: !hasIsolatedDb },
  async (t) => {
    try {
      await prisma.$connect();
    } catch {
      t.skip('Isolated database unreachable.');
      return;
    }

    const stamp = `sale-rev-${Date.now()}`;
    const product = await prisma.product.create({
      data: {
        name: `Sale Revenue Apple ${stamp}`,
        department: 'PRODUCE',
        standardCost: 1.25,
        retailPrice: 10,
        regularRetailPrice: 10,
        targetMargin: 0.4,
        shelfLifeDays: 7,
      },
    });
    const zeroPrice = await prisma.product.create({
      data: {
        name: `Sale Revenue Free ${stamp}`,
        department: 'PRODUCE',
        standardCost: 0,
        retailPrice: null,
        targetMargin: 0.4,
        shelfLifeDays: 7,
      },
    });
    const berryA = await prisma.product.create({
      data: {
        name: `Sale Revenue Berry A ${stamp}`,
        department: 'PRODUCE',
        standardCost: 1,
        retailPrice: 5,
        shelfLifeDays: 5,
      },
    });
    const berryB = await prisma.product.create({
      data: {
        name: `Sale Revenue Berry B ${stamp}`,
        department: 'PRODUCE',
        standardCost: 1.4,
        retailPrice: 7,
        shelfLifeDays: 5,
      },
    });
    const bundle = await prisma.bundle.create({
      data: {
        name: `Sale Revenue Trio ${stamp}`,
        bundleSku: `BUNDLE-${stamp}`,
        bundlePrice: 14.99,
        isActive: true,
        items: {
          create: [
            { productId: berryA.id, quantity: 1 },
            { productId: berryB.id, quantity: 1 },
          ],
        },
      },
    });

    const productIds = [product.id, zeroPrice.id, berryA.id, berryB.id];

    t.after(async () => {
      await prisma.markdownEvent.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.inventoryLot.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.inventoryTransaction.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.bundleItem.deleteMany({ where: { bundleId: bundle.id } });
      await prisma.bundle.delete({ where: { id: bundle.id } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    });

    await postProductReceipt({
      productId: product.id,
      quantityUnits: 20,
      unitCostAtTime: 1.25,
      staffId: 'test-staff',
      referenceId: `RCV-${stamp}`,
    });
    await postProductReceipt({
      productId: zeroPrice.id,
      quantityUnits: 5,
      unitCostAtTime: 0.8,
      staffId: 'test-staff',
      referenceId: `RCV-ZERO-${stamp}`,
    });
    await prisma.product.update({
      where: { id: zeroPrice.id },
      data: { standardCost: 0, retailPrice: null },
    });
    await rebuildLotsFromLedger({ productIds: [product.id, zeroPrice.id] });

    const shelfSale = await recordProductSale({
      productId: product.id,
      quantity: 4,
      staffId: 'test-staff',
      location: 'floor',
      referenceId: `SALE-SHELF-${stamp}`,
    });
    const overrideSale = await recordProductSale({
      productId: product.id,
      quantity: 2,
      staffId: 'pos-webhook',
      location: 'floor',
      unitPriceOverride: 3.5,
      referenceId: `SALE-OVERRIDE-${stamp}`,
    });
    const zeroSale = await recordProductSale({
      productId: zeroPrice.id,
      quantity: 1,
      staffId: 'test-staff',
      location: 'floor',
      referenceId: `SALE-ZERO-${stamp}`,
    });
    const bundleSale = await executeBundleSale(bundle.bundleSku, `BUNDLE-REF-${stamp}`, {
      staffId: 'pos-webhook',
      quantitySold: 1,
    });

    assert.equal(shelfSale.unitPrice, 10);
    assert.equal(shelfSale.grossRevenue, 40);
    assert.equal(overrideSale.unitPrice, 3.5);
    assert.equal(overrideSale.grossRevenue, 7);
    assert.equal(zeroSale.grossRevenue, 0);
    assert.equal(bundleSale.bundleGrossRevenue, 14.99);

    const legacy = await prisma.inventoryTransaction.create({
      data: {
        productId: product.id,
        staffId: 'test-staff',
        qtyChange: -5,
        transactionType: TransactionType.Sale,
        fromLocation: InventoryLocation.Retail_Floor,
        toLocation: InventoryLocation.Customer_Out,
        unitCostAtTime: 80,
        referenceId: `SALE-LEGACY-${stamp}`,
        notes: 'Legacy sale with no recorded price',
      },
    });
    const unsupportedReturn = await prisma.inventoryTransaction.create({
      data: {
        productId: product.id,
        staffId: 'test-staff',
        qtyChange: 2,
        transactionType: TransactionType.Sale,
        fromLocation: InventoryLocation.Customer_Out,
        toLocation: InventoryLocation.Retail_Floor,
        unitCostAtTime: 10,
        realizedUnitPrice: 10,
        realizedLineRevenue: 20,
        referenceId: `SALE-RETURN-${stamp}`,
        notes: 'Positive quantity is not a supported return',
      },
    });
    const waste = await prisma.inventoryTransaction.create({
      data: {
        productId: product.id,
        staffId: 'test-staff',
        qtyChange: -1,
        transactionType: TransactionType.Waste,
        fromLocation: InventoryLocation.Retail_Floor,
        toLocation: InventoryLocation.Waste_Bin,
        unitCostAtTime: 2.25,
        referenceId: `WASTE-${stamp}`,
      },
    });

    const saleIds = [
      shelfSale.transactionId,
      overrideSale.transactionId,
      zeroSale.transactionId,
      ...bundleSale.transactions.map((row) => row.id),
      legacy.id,
      unsupportedReturn.id,
      waste.id,
    ];
    await prisma.inventoryTransaction.updateMany({
      where: { id: { in: saleIds } },
      data: { timestamp: WINDOW_AT },
    });

    const beforeRows = await prisma.inventoryTransaction.findMany({
      where: { id: { in: saleIds } },
      select: {
        id: true,
        transactionType: true,
        qtyChange: true,
        unitCostAtTime: true,
        realizedUnitPrice: true,
        realizedLineRevenue: true,
      },
    });
    const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
    const shelfRow = beforeById.get(shelfSale.transactionId);
    const overrideRow = beforeById.get(overrideSale.transactionId);
    const zeroRow = beforeById.get(zeroSale.transactionId);
    assert.equal(shelfRow?.realizedLineRevenue, 40);
    assert.equal(shelfRow?.realizedUnitPrice, 10);
    assert.equal(overrideRow?.realizedLineRevenue, 7);
    assert.equal(overrideRow?.realizedUnitPrice, 3.5);
    assert.equal(zeroRow?.realizedLineRevenue, 0);
    assert.equal(zeroRow?.realizedUnitPrice, 0);
    assert.equal(beforeById.get(legacy.id)?.realizedLineRevenue, null);

    const bundleRows = bundleSale.transactions.map((row) => beforeById.get(row.id));
    const bundleRevenue = Number(
      bundleRows.reduce((total, row) => total + (row?.realizedLineRevenue ?? 0), 0).toFixed(2)
    );
    assert.equal(bundleRevenue, 14.99);
    for (const row of bundleRows) {
      assert.equal(row?.transactionType, TransactionType.POS_Sale);
      assert.notEqual(row?.realizedLineRevenue, null);
      assert.ok((row?.unitCostAtTime ?? 0) > 0);
      assert.notEqual(row?.unitCostAtTime, row?.realizedUnitPrice);
    }

    const pricedLines = beforeRows.filter((row) => row.transactionType !== TransactionType.Waste);
    assert.equal(sumRecognizedGrossSales(pricedLines).grossSalesRevenue, 61.99);
    assert.equal(sumRecognizedGrossSales(pricedLines).legacyUnpricedSaleCount, 1);
    assert.equal(sumRecognizedGrossSales(pricedLines).legacyUnpricedSaleUnits, 5);

    const beforeKpi = await calculateRealTimeWastePct({
      startDate: WINDOW_START,
      endDate: WINDOW_END,
    });
    assert.equal(beforeKpi.grossSalesRevenue, 61.99);
    assert.equal(beforeKpi.totalDiscardValue, 2.25);
    assert.equal(beforeKpi.legacyUnpricedSaleCount, 1);
    assert.equal(beforeKpi.legacyUnpricedSaleUnits, 5);
    assert.match(beforeKpi.formulaBreakdown, /original sale price was not recorded/);

    await prisma.product.update({
      where: { id: product.id },
      data: { retailPrice: 0.25, regularRetailPrice: 10 },
    });
    await prisma.product.update({
      where: { id: berryA.id },
      data: { retailPrice: 0.25 },
    });
    await prisma.product.update({
      where: { id: berryB.id },
      data: { retailPrice: 0.25 },
    });
    await prisma.bundle.update({
      where: { id: bundle.id },
      data: { bundlePrice: 1 },
    });
    await prisma.markdownEvent.create({
      data: {
        productId: product.id,
        staffId: 'test-staff',
        quantityUnits: 10,
        regularPrice: 10,
        markdownPrice: 0.25,
        discountPct: 97.5,
        revenueImpact: 97.5,
        referenceId: `MD-${stamp}`,
      },
    });

    const afterRows = await prisma.inventoryTransaction.findMany({
      where: { id: { in: saleIds } },
      select: { id: true, realizedUnitPrice: true, realizedLineRevenue: true, unitCostAtTime: true },
    });
    for (const row of afterRows) {
      const prior = beforeById.get(row.id);
      assert.equal(row.realizedLineRevenue, prior?.realizedLineRevenue);
      assert.equal(row.realizedUnitPrice, prior?.realizedUnitPrice);
      assert.equal(row.unitCostAtTime, prior?.unitCostAtTime);
    }

    const afterKpi = await calculateRealTimeWastePct({
      startDate: WINDOW_START,
      endDate: WINDOW_END,
    });
    assert.equal(afterKpi.grossSalesRevenue, beforeKpi.grossSalesRevenue);
    assert.equal(afterKpi.totalDiscardValue, beforeKpi.totalDiscardValue);
    assert.equal(afterKpi.totalWasteValue, beforeKpi.totalWasteValue);
    assert.equal(afterKpi.legacyUnpricedSaleCount, 1);
    assert.notEqual(afterKpi.grossSalesRevenue, 4 * 0.25 + 2 * 0.25 + 14.99);
    assert.notEqual(afterKpi.grossSalesRevenue, 61.99 - 97.5);
  }
);
