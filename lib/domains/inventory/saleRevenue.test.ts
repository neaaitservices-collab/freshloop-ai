import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownRevenueImpact } from '@/lib/utils/money';
import { wasteNumeratorDollars } from '@/lib/domains/stats/scrapBucketEconomics';
import {
  allocateBundleRealizedRevenue,
  bundleCatalogGrossRevenue,
  legacySaleDisclosure,
  priceProductSale,
  resolveProductSaleUnitPrice,
  sumRecognizedGrossSales,
} from '@/lib/domains/inventory/saleRevenue';

test('product sale price prefers override, then shelf, then cost over margin', () => {
  assert.equal(
    resolveProductSaleUnitPrice({
      quantity: 1,
      unitPriceOverride: 2.5,
      retailPrice: 9,
      standardCost: 1,
      targetMargin: 0.4,
    }),
    2.5
  );
  assert.equal(
    resolveProductSaleUnitPrice({
      quantity: 1,
      unitPriceOverride: 0,
      retailPrice: 9,
      standardCost: 1,
      targetMargin: 0.4,
    }),
    9
  );
  const fromCost = priceProductSale({
    quantity: 1,
    retailPrice: null,
    standardCost: 2.1,
    targetMargin: 0.4,
  });
  assert.equal(fromCost.realizedUnitPrice, 3.5);
  assert.equal(fromCost.realizedLineRevenue, 3.5);
  const clampedMargin = priceProductSale({
    quantity: 1,
    retailPrice: null,
    standardCost: 1,
    targetMargin: 0.99,
  });
  assert.equal(clampedMargin.realizedUnitPrice, 20);
  assert.equal(clampedMargin.realizedLineRevenue, 20);
  assert.equal(
    resolveProductSaleUnitPrice({
      quantity: 1,
      retailPrice: null,
      standardCost: null,
      targetMargin: 0.4,
    }),
    0
  );
});

test('new product sales record revenue and a later shelf price does not rewrite it', () => {
  const sold = priceProductSale({
    quantity: 4,
    retailPrice: 3.99,
    standardCost: 1.2,
    targetMargin: 0.4,
  });
  assert.equal(sold.realizedUnitPrice, 3.99);
  assert.equal(sold.realizedLineRevenue, 15.96);
  assert.equal(sold.grossRevenue, sold.realizedLineRevenue);

  const markedDown = priceProductSale({
    quantity: 4,
    retailPrice: 1.99,
    standardCost: 1.2,
    targetMargin: 0.4,
  });
  assert.equal(markedDown.realizedLineRevenue, 7.96);

  const historical = sumRecognizedGrossSales([
    {
      transactionType: 'Sale',
      qtyChange: -4,
      realizedLineRevenue: sold.realizedLineRevenue,
      currentRetailPrice: 1.99,
    },
  ]);
  assert.equal(historical.grossSalesRevenue, 15.96);
  assert.equal(historical.legacyUnpricedSaleCount, 0);
  assert.notEqual(historical.grossSalesRevenue, markedDown.realizedLineRevenue);
  assert.notEqual(historical.grossSalesRevenue, 1.99 * 4);
});

test('fractional product quantity uses cent rounding and records zero when no price exists', () => {
  const fractional = priceProductSale({
    quantity: 2.5,
    retailPrice: 3.99,
    standardCost: 1,
    targetMargin: 0.4,
  });
  assert.equal(fractional.realizedLineRevenue, 9.98);

  const freeOrUnknown = priceProductSale({
    quantity: 1,
    retailPrice: null,
    standardCost: 0,
    targetMargin: 0.4,
  });
  assert.equal(freeOrUnknown.realizedLineRevenue, 0);
  assert.equal(freeOrUnknown.realizedUnitPrice, 0);
});

test('bundle revenue is allocated once and stays fixed if shelf weights would change', () => {
  const sold = allocateBundleRealizedRevenue({
    bundlePrice: 14.99,
    quantitySold: 1,
    components: [
      { qty: 1, retailPrice: 5, standardCost: 1 },
      { qty: 1, retailPrice: 7, standardCost: 2 },
    ],
  });
  const sum = Number(sold.reduce((total, line) => total + line.realizedLineRevenue, 0).toFixed(2));
  assert.equal(sum, bundleCatalogGrossRevenue(14.99, 1));
  assert.equal(sum, 14.99);
  assert.ok(sold[1].realizedLineRevenue > sold[0].realizedLineRevenue);

  const historical = sumRecognizedGrossSales(
    sold.map((line) => ({
      transactionType: 'POS_Sale',
      qtyChange: -1,
      realizedLineRevenue: line.realizedLineRevenue,
      currentRetailPrice: 0.25,
    }))
  );
  assert.equal(historical.grossSalesRevenue, 14.99);

  const reweighted = allocateBundleRealizedRevenue({
    bundlePrice: 14.99,
    quantitySold: 1,
    components: [
      { qty: 1, retailPrice: 20, standardCost: 1 },
      { qty: 1, retailPrice: 1, standardCost: 2 },
    ],
  });
  assert.notEqual(reweighted[0].realizedLineRevenue, sold[0].realizedLineRevenue);
  const reweightedSum = Number(
    reweighted.reduce((total, line) => total + line.realizedLineRevenue, 0).toFixed(2)
  );
  assert.equal(reweightedSum, 14.99);
});

test('bundle allocation covers equal split, quantity weights, and unsupported negative prices', () => {
  const equal = allocateBundleRealizedRevenue({
    bundlePrice: 10,
    quantitySold: 1,
    components: [
      { qty: 1, retailPrice: null, standardCost: null },
      { qty: 2, retailPrice: 0, standardCost: 0 },
      { qty: 1, retailPrice: null, standardCost: null },
    ],
  });
  assert.deepEqual(
    equal.map((line) => line.realizedLineRevenue),
    [2.5, 5, 2.5]
  );

  const noPriceBasis = allocateBundleRealizedRevenue({
    bundlePrice: 10,
    quantitySold: 1,
    components: [
      { qty: 1, retailPrice: null, standardCost: null },
      { qty: 1, retailPrice: null, standardCost: null },
      { qty: 1, retailPrice: null, standardCost: null },
    ],
  });
  assert.deepEqual(
    noPriceBasis.map((line) => line.realizedLineRevenue),
    [3.34, 3.33, 3.33]
  );

  const negative = allocateBundleRealizedRevenue({
    bundlePrice: -5,
    quantitySold: 2,
    components: [{ qty: 1, retailPrice: 4, standardCost: 1 }],
  });
  assert.equal(negative[0].realizedLineRevenue, 0);
  assert.equal(bundleCatalogGrossRevenue(-5, 2), -10);
});

test('legacy rows stay unknown and are not priced from the current shelf or from cost', () => {
  const recognized = sumRecognizedGrossSales([
    {
      transactionType: 'Sale',
      qtyChange: -4,
      realizedLineRevenue: null,
      currentRetailPrice: 9.99,
    },
    {
      transactionType: 'POS_Sale',
      qtyChange: -2,
      realizedLineRevenue: null,
      currentRetailPrice: 6,
    },
    {
      transactionType: 'Sale',
      qtyChange: -1,
      realizedLineRevenue: 0,
      currentRetailPrice: 8,
    },
    {
      transactionType: 'Sale',
      qtyChange: 3,
      realizedLineRevenue: 30,
      currentRetailPrice: 10,
    },
    {
      transactionType: 'Waste',
      qtyChange: -2,
      realizedLineRevenue: null,
      currentRetailPrice: 5,
    },
    {
      transactionType: 'Sale',
      qtyChange: -1,
      realizedLineRevenue: Number.NaN,
      currentRetailPrice: 4,
    },
  ]);

  assert.equal(recognized.grossSalesRevenue, 0);
  assert.equal(recognized.legacyUnpricedSaleCount, 3);
  assert.equal(recognized.legacyUnpricedSaleUnits, 7);
  assert.equal(recognized.grossSalesRevenue, 0);
  assert.notEqual(recognized.grossSalesRevenue, 4 * 9.99 + 2 * 6);
  assert.match(legacySaleDisclosure(4, 8), /Current shelf price is not applied/);
  assert.equal(legacySaleDisclosure(0, 0), '');
});

test('physical waste and markdown loss stay outside recognized sales', () => {
  const sales = sumRecognizedGrossSales([
    {
      transactionType: 'Sale',
      qtyChange: -10,
      realizedLineRevenue: 39.9,
      currentRetailPrice: 1.5,
    },
  ]);
  const waste = wasteNumeratorDollars(4.25, 45.5);
  const markdownLoss = markdownRevenueImpact(10, 3.99, 1.5);

  assert.equal(sales.grossSalesRevenue, 39.9);
  assert.equal(waste, 49.75);
  assert.equal(markdownLoss, 24.9);
  assert.notEqual(sales.grossSalesRevenue, 39.9 - markdownLoss);
  assert.notEqual(waste, 49.75 + markdownLoss);
});
