import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { posSaleIdempotencyKey } from '@/lib/domains/inventory/saleIdempotency';
import { priceImportedLine } from '@/lib/domains/inventory/saleRevenue';
import { torontoYmd } from '@/lib/domains/stats/storeTime';
import {
  SQUARE_ITEMS_DETAIL_HEADERS,
  SQUARE_OPTIONAL_NEWER_HEADERS,
  classifyCsvSales,
  csvSaleIdempotencyKey,
  csvTransactionIdentity,
  parseMoney,
  parseSaleDate,
  resolveImportMapping,
  squareItemsDetailCsv,
} from '@/lib/domains/inventory/csvSalesParse';
import { csvColumnMappingSchema } from '@/lib/security/schemas/csvSalesImport';

const FIXTURE = readFileSync(
  'lib/domains/inventory/fixtures/square-items-detail.sample.csv',
  'utf8'
);

const CATALOG: Record<string, { productId: string; productName: string }> = {
  BANANA: { productId: 'banana', productName: 'Synthetic Banana' },
  BREAD: { productId: 'bread', productName: 'Synthetic Bread' },
  CHEESE: { productId: 'cheese', productName: 'Synthetic Cheese' },
};

function classify(csv: string, existingKeys?: Set<string>, mapping = csvColumnMappingSchema.parse({
  sku: 'SKU',
  qty: 'Qty',
  unit: 'Unit',
  revenue: 'Net Sales',
  date: 'Date',
})) {
  const result = classifyCsvSales({
    csv,
    mapping,
    fileSha256: 'file-hash',
    resolveSku: (sku) => CATALOG[sku] ?? null,
    existingKeys,
  });
  if (!result.ok) throw new Error(result.error);
  return result.preview;
}

test('money parsing accepts currency symbols and commas and rejects bad amounts', () => {
  assert.equal(parseMoney('$1,234.50'), 1234.5);
  assert.equal(parseMoney('$0.00'), 0);
  assert.equal(parseMoney('12.5'), 12.5);
  assert.equal(parseMoney('($3.00)'), -3);
  assert.equal(parseMoney('-$2.00'), -2);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('n/a'), null);
  assert.equal(parseMoney('NaN'), null);
  assert.equal(priceImportedLine(3, 10).realizedLineRevenue, 10);
});

test('Square preset matches newer headers, the older file without Channel/Token, and extra columns', () => {
  const newer = resolveImportMapping([...SQUARE_ITEMS_DETAIL_HEADERS], null);
  assert.equal(newer.ok, true);
  if (!newer.ok) return;
  assert.equal(newer.preset, 'square-items-detail');
  assert.equal(newer.mapping.revenue, 'Net Sales');
  assert.equal(newer.mapping.externalRef, 'Transaction ID');
  assert.equal(newer.mapping.variation, 'Price Point Name');

  const optional = new Set<string>(SQUARE_OPTIONAL_NEWER_HEADERS);
  const olderHeaders = SQUARE_ITEMS_DETAIL_HEADERS.filter((header) => !optional.has(header));
  const older = resolveImportMapping(olderHeaders, null);
  assert.equal(older.ok, true);
  if (older.ok) assert.equal(older.preset, 'square-items-detail');

  const messy = SQUARE_ITEMS_DETAIL_HEADERS.map((header, index) =>
    index % 2 === 0 ? ` ${header.toLowerCase()} ` : header
  );
  messy.push('Card Brand');
  const cased = resolveImportMapping(messy, null);
  assert.equal(cased.ok, true);
  if (cased.ok) assert.equal(cased.preset, 'square-items-detail');

  const broken = SQUARE_ITEMS_DETAIL_HEADERS.filter((header) => header !== 'Transaction ID');
  const missing = resolveImportMapping(broken, null);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.error, /Transaction ID/);
});

test('generic mapping is used when the file is not a Square Items Detail export', () => {
  const headers = ['PLU', 'Qty', 'Unit', 'Revenue', 'Sold', 'Receipt'];
  const mapping = csvColumnMappingSchema.parse({
    sku: 'PLU',
    qty: 'Qty',
    unit: 'Unit',
    revenue: 'Revenue',
    date: 'Sold',
    externalRef: 'Receipt',
  });
  const unresolved = resolveImportMapping(headers, null);
  assert.equal(unresolved.ok, false);
  const resolved = resolveImportMapping(headers, mapping);
  assert.equal(resolved.ok, true);
  if (resolved.ok) assert.equal(resolved.preset, null);

  const csv = 'PLU,Qty,Unit,Revenue,Sold,Receipt\nBANANA,2,lb,10.00,2098-08-01,R-1\n';
  const preview = classifyCsvSales({
    csv,
    mapping,
    fileSha256: 'abc',
    resolveSku: (sku) => CATALOG[sku] ?? null,
  });
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.preview.preset, null);
  assert.equal(preview.preview.matched.length, 1);
  assert.equal(preview.preview.matched[0]?.saleDate, '2098-08-01');
  assert.equal(
    preview.preview.matched[0]?.idempotencyKey,
    posSaleIdempotencyKey(csvTransactionIdentity({
      transactionId: 'R-1',
      item: '',
      variation: '',
      lineIndex: 0,
    }))
  );
});

test('synthetic Square week lists seven dates, unknown SKUs, and bad rows', () => {
  const header = FIXTURE.split('\n')[0];
  assert.equal(header, SQUARE_ITEMS_DETAIL_HEADERS.join(','));
  assert.match(FIXTURE, /Synthetic test data, not a Square export/);
  const preview = classify(FIXTURE);
  assert.equal(preview.preset, 'square-items-detail');
  assert.deepEqual(preview.dateRange, { from: '2098-08-01', to: '2098-08-07' });
  assert.equal(preview.days.length, 7);
  assert.equal(preview.days[0]?.lines, 2);
  assert.equal(preview.days[0]?.revenue, 16.5);
  assert.equal(preview.days[1]?.revenue, 1234.5);
  assert.equal(preview.matched.length, 8);
  assert.equal(preview.unknown.length, 1);
  assert.equal(preview.unknown[0]?.sku, 'UNKNOWN-PLU');
  assert.equal(preview.bad.length, 5);
  assert.equal(preview.refund.length, 1);
  const issues = preview.bad.map((row) => row.issues[0]);
  assert.ok(issues.includes('Quantity is not a number.'));
  assert.ok(issues.includes('Quantity cannot be negative.'));
  assert.ok(issues.includes('Date could not be read.'));
  assert.ok(issues.includes('Line revenue is not a number.'));
  assert.ok(issues.includes('Line revenue cannot be negative.'));
  const dates = new Set(preview.matched.map((row) => row.saleDate));
  assert.equal(dates.size, 7);
  for (const row of preview.matched) {
    assert.ok(row.soldAt);
    assert.equal(torontoYmd(new Date(row.soldAt)), row.saleDate);
  }
  const sameReceipt = preview.matched.filter((row) => row.externalRef === 'W-DAY1');
  assert.equal(sameReceipt.length, 2);
  assert.notEqual(sameReceipt[0]?.idempotencyKey, sameReceipt[1]?.idempotencyKey);
});

test('the same file and an overlapping week post nothing new for lines already seen', () => {
  const first = classify(FIXTURE);
  const keys = new Set(
    first.rows.map((row) => row.idempotencyKey).filter((key): key is string => Boolean(key))
  );
  const again = classify(FIXTURE, keys);
  assert.equal(again.matched.length, 0);
  assert.equal(again.duplicate.length, first.matched.length);
  assert.equal(again.unknown.length, 1);

  const overlap = squareItemsDetailCsv([
    {
      Date: '08/08/2098',
      Item: 'Synthetic Banana',
      Qty: '1',
      'Price Point Name': 'Bunch',
      SKU: 'BANANA',
      'Gross Sales': '$5.00',
      'Net Sales': '$5.00',
      Unit: 'lb',
      'Transaction ID': 'W-NEW',
      'Event Type': 'Payment',
    },
    {
      Date: '08/01/2098',
      Item: 'Synthetic Banana',
      Qty: '2',
      'Price Point Name': 'Bunch',
      SKU: 'BANANA',
      'Gross Sales': '$13.00',
      'Net Sales': '$12.50',
      Unit: 'lb',
      'Transaction ID': 'W-DAY1',
      'Event Type': 'Payment',
    },
    {
      Date: '08/01/2098',
      Item: 'Synthetic Bread',
      Qty: '1',
      'Price Point Name': 'Loaf',
      SKU: 'BREAD',
      'Gross Sales': '$4.00',
      'Net Sales': '$4.00',
      Unit: 'ea',
      'Transaction ID': 'W-DAY1',
      'Event Type': 'Payment',
    },
  ]);
  const week = classify(overlap, keys);
  assert.equal(week.matched.length, 1);
  assert.equal(week.matched[0]?.saleDate, '2098-08-08');
  assert.equal(week.duplicate.length, 2);
  assert.equal(week.dateRange?.from, '2098-08-01');
  assert.equal(week.dateRange?.to, '2098-08-08');
});

test('a sale date is noon Toronto and an unreadable date is rejected', () => {
  const parsed = parseSaleDate('08/01/2098');
  assert.ok(parsed);
  assert.equal(torontoYmd(parsed), '2098-08-01');
  assert.equal(parseSaleDate('2098-02-31'), null);
  assert.equal(parseSaleDate('not-a-date'), null);
  assert.equal(
    csvSaleIdempotencyKey({ fileSha256: 'abc', rowIndex: 4 }),
    'sale:csv:abc:4'
  );
});

test('column mapping schema rejects duplicate columns', () => {
  assert.throws(() =>
    csvColumnMappingSchema.parse({
      sku: 'PLU',
      qty: 'PLU',
      unit: 'Unit',
      revenue: 'Revenue',
      date: 'Date',
    })
  );
});

test('sales import routes require a manager and only confirm posts through recordSale', () => {
  const preview = readFileSync('app/api/admin/sales-import/preview/route.ts', 'utf8');
  const confirm = readFileSync('app/api/admin/sales-import/confirm/route.ts', 'utf8');
  const mapping = readFileSync('app/api/admin/sales-import/mapping/route.ts', 'utf8');
  const domain = readFileSync('lib/domains/inventory/csvSalesImport.ts', 'utf8');
  for (const source of [preview, confirm, mapping]) {
    assert.match(source, /requireManagerStaff/);
  }
  assert.ok(preview.indexOf('requireManagerStaff') < preview.indexOf('previewCsvSales'));
  assert.ok(confirm.indexOf('requireManagerStaff') < confirm.indexOf('confirmCsvSales'));
  assert.match(preview, /assertMutationRateLimit/);
  assert.match(confirm, /assertMutationRateLimit/);
  assert.equal(preview.includes('recordProductSale'), false);
  const previewFn = domain.slice(
    domain.indexOf('export async function previewCsvSales'),
    domain.indexOf('export interface CsvConfirmResult')
  );
  assert.equal(previewFn.includes('recordProductSale'), false);
  const confirmFn = domain.slice(domain.indexOf('export async function confirmCsvSales'));
  assert.match(confirmFn, /recordProductSale\(/);
  assert.match(confirmFn, /location: 'floor'/);
  assert.match(confirmFn, /lineRevenue: row\.revenue/);
  assert.match(confirmFn, /soldAt: new Date\(row\.soldAt\)/);
});
