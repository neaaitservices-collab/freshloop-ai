import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { processInvoiceOcr } from '@/lib/domains/ai/gemini';
import { selectInvoiceHeaderTotal } from '@/lib/domains/receiving/invoiceHeaderTotal';
import { interpretInvoiceOcrModel } from '@/lib/domains/receiving/invoiceOcrModel';
import {
  codesIfUnfiltered,
  mergeReadPages,
  type InvoicePageLine,
} from '@/lib/domains/receiving/invoicePageScan';

/**
 * Tony Deodato invoice 896347. Names, codes, and amounts only.
 * 35 shipped lines plus 6 rows shipped 0 at $0. Printed line amounts sum to 1500.75.
 * The printed subtotal is 1536.08. The paper itself is off by 35.33.
 */
const ROWS: Array<[string, string, number, string, number, number]> = [
  ['ORGANIC BANANA', 'VOBA02', 1, 'CASE', 53.25, 53.25],
  ['AVOCADO 36CT', 'AV36', 0, 'CASE', 0, 0],
  ['15KG CLEMENTINES', 'CL3C', 1, 'CASE', 49.5, 49.5],
  ['DATES 12x1', 'DA6C', 0, 'CASE', 0, 0],
  ['KIWI FRUIT BULK 10KG', 'KI2C', 1, 'CASE', 53.25, 53.25],
  ['MANGOES', 'MA1C', 3, 'CASE', 17.8, 53.4],
  ['PASSION FRUIT', 'PA5C', 0, 'CASE', 0, 0],
  ['SIZE 6 GOLDEN RIPE PINEAPPLE', 'PI7M', 1, 'CASE', 23.25, 23.25],
  ['POMEGRANATE', 'PO54C', 1, 'CASE', 77, 77],
  ['WATERMELON RADISH', 'WA9C', 1, 'CASE', 78.75, 78.75],
  ['ASPARAGUS 11LB', 'AS1C', 1, 'CASE', 97.25, 97.25],
  ['GREEN BEANS', 'BE03C', 1, 'CASE', 58.25, 58.25],
  ["BROCCOLI 18'S", 'BR1J', 1, 'CASE', 36.5, 36.5],
  ['BRUSSEL SPROUTS', 'BR2C', 1, 'CASE', 63.75, 63.75],
  ['10LB RAINBOW CARROT', 'CA8Y', 3, 'BAG', 21, 63],
  ['CAULIFLOWER 12', 'CAU1C', 1, 'CASE', 35.75, 35.75],
  ['CELERY 24', 'CE1C', 1, 'CASE', 30.5, 30.5],
  ['GRAPES RED SEEDLESS', 'GR02C', 1, 'CASE', 49.5, 49.5],
  ['BLACK KALE', 'KA5C', 0, 'CASE', 0, 0],
  ['MIXED LETTUCE GREENS', 'LET9W', 1, 'CASE', 15.1, 15.1],
  ['SUGAR PEAS', 'SN2C', 1, 'CASE', 61.5, 61.5],
  ['ROMAINE 24 CANADIAN', 'RO24C', 1, 'CASE', 41, 41],
  ['BUNCH SPINACH', 'SP2C', 0, 'CASE', 0, 0],
  ['GREEN ONIONS', 'ON11C', 1, 'CASE', 71, 71],
  ['ITALIAN PARSLEY', 'PA3BU', 6, 'BUNCH', 0.75, 4.5],
  ['RADICCHIO', 'RA3C', 1, 'CASE', 20.75, 20.75],
  ['GRAPE TOMATO MEDLEY 12X1', 'TO37D', 1, 'CASE', 35.25, 35.25],
  ['BAG BASIL', 'BA31F', 1, 'BAG', 14, 14],
  ['ENGLISH CUCUMBER MEDIUM', 'CUE4C', 3, 'CASE', 20.75, 62.25],
  ['GREEN PEPPERS', 'PEPG1', 0, 'CASE', 0, 0],
  ['XL ORANGE PEPPERS', 'PEPO4', 1, 'CASE', 16.25, 16.25],
  ['PEPPERS RED XL 5KG CASE', 'PEPR4', 1, 'CASE', 19.25, 19.25],
  ['PEPPERS YELLOW XL 5KG CASE', 'PEPY4', 1, 'CASE', 16.25, 16.25],
  ['ZUCCHINI', 'ZO1C', 1, 'CASE', 30.75, 30.75],
  ['ESCHALLOTS', 'ESC1B', 2, 'BAG', 14, 28],
  ['VIDALIA ONIONS', 'ONO1M', 1, 'CASE', 52, 52],
  ['RED ONION JUMBO', 'ONO6A', 1, 'BAG', 22, 22],
  ['YUKON GOLD A POTATO', 'PO45J', 1, 'BAG', 42, 42],
  ['YAMS', 'YA1C', 1, 'CASE', 46, 46],
  ['3LB BABY ARUGULA', 'AR5F', 1, 'CASE', 25.75, 25.75],
  ['BLUEBERRIES 12X1 HALF PINT', 'BL1FH', 1, 'FLAT', 54.25, 54.25],
];

const ZERO_NAMES = [
  'AVOCADO 36CT',
  'DATES 12x1',
  'PASSION FRUIT',
  'BLACK KALE',
  'BUNCH SPINACH',
  'GREEN PEPPERS',
];

const PRINTED_SUBTOTAL = 1536.08;
const LINE_SUM = 1500.75;
const BAD_SCAN_TOTAL = 852.1;

function hundredDollarInvoice(printed: { subtotal?: number; totalAmount?: number; hst?: number; pst?: number }) {
  const body: Record<string, unknown> = {
    vendorName: 'Demo Produce Co',
    invoiceNumber: '1001',
    invoiceDate: '2026-11-01',
    lineItems: [
      {
        name: 'BANANAS',
        code: 'BAN1',
        department: 'PRODUCE',
        quantity: 2,
        unit: 'CASE',
        unitCost: 50,
        totalCost: 100,
      },
    ],
  };
  if ('subtotal' in printed) body.subtotal = printed.subtotal;
  if ('totalAmount' in printed) body.totalAmount = printed.totalAmount;
  if ('hst' in printed) body.hst = printed.hst;
  if ('pst' in printed) body.pst = printed.pst;
  return body;
}

function deodatoModel(printed?: { subtotal?: number; totalAmount?: number }) {
  const body: Record<string, unknown> = {
    vendorName: 'Tony Deodato & Sons',
    invoiceNumber: '896347',
    invoiceDate: '2026-10-15',
    lineItems: ROWS.map(([name, code, shipped, unit, unitCost, totalCost]) => ({
      name,
      code,
      department: 'PRODUCE',
      ordered: shipped,
      shipped,
      quantity: shipped,
      unit,
      unitCost,
      totalCost,
    })),
  };
  if (printed && 'subtotal' in printed) body.subtotal = printed.subtotal;
  if (printed && 'totalAmount' in printed) body.totalAmount = printed.totalAmount;
  return body;
}

function stockRows() {
  return ROWS.filter((row) => row[2] > 0);
}

function lineSumOf(amounts: number[]): number {
  return Number(amounts.reduce((sum, amount) => sum + amount, 0).toFixed(2));
}

async function readFakeModel(payload: unknown): Promise<{ totalAmount: number; names: string[]; summary: string; prompt: string }> {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'test-key';
  let prompt = '';
  globalThis.fetch = async (_url, init) => {
    const body = init && typeof init === 'object' && 'body' in init ? init.body : '';
    prompt = typeof body === 'string' ? body : '';
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };
  try {
    const result = await processInvoiceOcr('abc123', 'image/jpeg');
    return {
      totalAmount: result.totalAmount,
      names: result.lineItems.map((line) => line.name),
      summary: result.rawSummary ?? '',
      prompt,
    };
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey == null) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
}

test('Deodato keeps supplier codes on the 35 stock lines and the printed subtotal', () => {
  const priced = stockRows();
  assert.equal(ROWS.length, 41);
  assert.equal(priced.length, 35);
  assert.equal(lineSumOf(priced.map((row) => row[5])), LINE_SUM);
  assert.deepEqual(
    ROWS.filter((row) => row[2] === 0).map((row) => row[0]),
    ZERO_NAMES
  );

  const printed = deodatoModel({ subtotal: PRINTED_SUBTOTAL, totalAmount: BAD_SCAN_TOTAL });
  const blob = JSON.stringify(printed);
  for (const secret of ['KINGSTON', 'COBOURG', 'FORTUNE', 'BINNINGTON', 'KING STREET']) {
    assert.equal(blob.includes(secret), false);
  }

  const model = interpretInvoiceOcrModel(printed);
  assert.equal(model.lineItems.length, 35);
  assert.deepEqual(
    model.lineItems.map((line) => line.name),
    priced.map((row) => row[0])
  );
  assert.equal(model.excludedLines.length, 6);
  for (const name of ZERO_NAMES) {
    assert.equal(model.lineItems.some((line) => line.name === name), false);
    const dropped = model.excludedLines.find((line) => line.name === name);
    assert.ok(dropped);
    assert.equal(dropped.lineKind, 'zero');
    assert.equal(dropped.postsStock, false);
  }
  const lineSum = lineSumOf(model.lineItems.map((line) => line.totalCost));
  assert.equal(lineSum, LINE_SUM);
  assert.equal(model.subtotal, PRINTED_SUBTOTAL);
  assert.match(model.subtotalGap ?? '', /1536\.08/);
  assert.match(model.subtotalGap ?? '', /1500\.75/);

  const codes = codesIfUnfiltered(printed, model.lineItems.length);
  assert.deepEqual(
    codes,
    priced.map((row) => row[1])
  );
  assert.equal(codes.includes('AV36'), false);
  assert.equal(codes.includes('PEPG1'), false);

  const header = selectInvoiceHeaderTotal({
    printedSubtotal: model.subtotal,
    lineAmounts: model.lineItems.map((line) => line.totalCost),
  });
  assert.equal(header, PRINTED_SUBTOTAL);
  assert.notEqual(header, BAD_SCAN_TOTAL);
  assert.notEqual(header, LINE_SUM);

  const blank = interpretInvoiceOcrModel(deodatoModel());
  assert.equal(blank.subtotal, null);
  assert.equal(blank.subtotalGap, null);
  assert.equal(
    selectInvoiceHeaderTotal({
      printedSubtotal: blank.subtotal,
      lineAmounts: blank.lineItems.map((line) => line.totalCost),
    }),
    LINE_SUM
  );

  const stockLines: InvoicePageLine[] = priced.map((row) => ({
    page: 1,
    name: row[0],
    code: row[1],
    quantity: row[2],
    unit: row[3],
    unitCost: row[4],
    totalCost: row[5],
    department: 'PRODUCE',
    casePackSize: 1,
    subUnit: 'units',
  }));
  const merged = mergeReadPages([
    {
      index: 1,
      status: 'read',
      attempt: 1,
      updatedAt: '2026-10-15T11:43:00.000Z',
      vendorName: 'Tony Deodato & Sons',
      invoiceNumber: '896347',
      invoiceDate: '2026-10-15',
      subtotal: PRINTED_SUBTOTAL,
      lines: stockLines,
    },
  ]);
  assert.equal(merged.lineSum, LINE_SUM);
  assert.match(merged.pageScanReviewFlags.join(' '), /1536\.08 does not match the line sum 1500\.75/);
});

test('a charge between stock lines does not shift the supplier codes', () => {
  const raw = {
    vendorName: 'Tony Deodato & Sons',
    invoiceNumber: '896347',
    invoiceDate: '2026-10-15',
    lineItems: [
      {
        name: 'ORGANIC BANANA',
        code: 'VOBA02',
        quantity: 1,
        unit: 'CASE',
        unitCost: 53.25,
        totalCost: 53.25,
        department: 'PRODUCE',
      },
      {
        name: 'FUEL SURCHARGE',
        code: 'FUEL',
        quantity: 1,
        unit: 'CHRG',
        unitCost: 0,
        totalCost: 0,
        department: 'PRODUCE',
      },
      {
        name: 'KIWI FRUIT BULK 10KG',
        code: ' KI2C ',
        quantity: 1,
        unit: 'CASE',
        unitCost: 53.25,
        totalCost: 53.25,
        department: 'PRODUCE',
      },
    ],
  };
  const model = interpretInvoiceOcrModel(raw);
  assert.equal(model.lineItems.length, 2);
  assert.deepEqual(codesIfUnfiltered(raw, model.lineItems.length), ['VOBA02', 'KI2C']);
  assert.deepEqual(codesIfUnfiltered(raw, raw.lineItems.length), [undefined, undefined, undefined]);
});

describe('Deodato header total from the invoice reader', { concurrency: 1 }, () => {
  test('uses the printed subtotal, not the old scan total or the line sum', async () => {
    const read = await readFakeModel(deodatoModel({ subtotal: PRINTED_SUBTOTAL, totalAmount: BAD_SCAN_TOTAL }));
    assert.equal(read.names.length, 35);
    for (const name of ZERO_NAMES) assert.equal(read.names.includes(name), false);
    assert.equal(read.totalAmount, PRINTED_SUBTOTAL);
    assert.notEqual(read.totalAmount, BAD_SCAN_TOTAL);
    assert.notEqual(read.totalAmount, LINE_SUM);
    assert.match(read.summary, /1536\.08 does not match the line sum 1500\.75/);
    assert.match(read.prompt, /Never compute or adjust/);
    assert.match(read.prompt, /supplier item code/);
    assert.match(read.prompt, /set their quantity to 0/);
    assert.equal(read.prompt.includes('equals sum of department totals'), false);
  });

  test('uses the line sum when the page prints no subtotal and no total', async () => {
    const read = await readFakeModel(deodatoModel());
    assert.equal(read.totalAmount, LINE_SUM);
    assert.equal(read.summary.includes('does not match the line sum'), false);
  });

  test('uses a printed total when the subtotal field was omitted', async () => {
    const read = await readFakeModel(deodatoModel({ totalAmount: PRINTED_SUBTOTAL }));
    assert.equal(read.totalAmount, PRINTED_SUBTOTAL);
    assert.notEqual(read.totalAmount, LINE_SUM);
  });

  test('uses the printed subtotal when hst and a tax-inclusive total are also present', async () => {
    const read = await readFakeModel(hundredDollarInvoice({ subtotal: 100, hst: 13, totalAmount: 113 }));
    assert.equal(read.totalAmount, 100);
    assert.notEqual(read.totalAmount, 113);
  });

  test('a raw response with no subtotal, hst 13, and total 113 uses the line sum', async () => {
    const read = await readFakeModel(hundredDollarInvoice({ hst: 13, totalAmount: 113 }));
    assert.equal(read.totalAmount, 100);
    assert.notEqual(read.totalAmount, 113);
  });

  test('uses the line sum when hst is present and the subtotal was omitted', async () => {
    const hst = await readFakeModel(hundredDollarInvoice({ hst: 13, totalAmount: 113 }));
    assert.equal(hst.totalAmount, 100);
    assert.notEqual(hst.totalAmount, 113);

    const pst = await readFakeModel(hundredDollarInvoice({ pst: 13, totalAmount: 113 }));
    assert.equal(pst.totalAmount, 100);
    assert.notEqual(pst.totalAmount, 113);

    const alias = hundredDollarInvoice({ totalAmount: 113 });
    alias.HST = 13;
    const upper = await readFakeModel(alias);
    assert.equal(upper.totalAmount, 100);
    assert.notEqual(upper.totalAmount, 113);
  });

  test('uses a printed total of 1536.08 when no subtotal and no tax are present', async () => {
    const omitted = deodatoModel({ totalAmount: PRINTED_SUBTOTAL });
    const zeroTax = deodatoModel({ totalAmount: PRINTED_SUBTOTAL });
    zeroTax.hst = 0;
    zeroTax.pst = 0;
    for (const payload of [omitted, zeroTax]) {
      const read = await readFakeModel(payload);
      assert.equal(read.totalAmount, 1536.08);
      assert.notEqual(read.totalAmount, LINE_SUM);
    }
  });
});

test('the page-scan prompt reads the printed subtotal and does not add it up', () => {
  const route = fs.readFileSync(path.join(process.cwd(), 'app/api/invoice-ocr/route.ts'), 'utf8');
  const gemini = fs.readFileSync(path.join(process.cwd(), 'lib/domains/ai/gemini.ts'), 'utf8');
  assert.equal(route.includes('subtotal is the sum of the line totals'), false);
  assert.match(route, /subtotal is read exactly as printed on the invoice and is never computed from the lines/);
  assert.match(gemini, /selectInvoiceHeaderTotal/);
  assert.match(gemini, /printed subtotal before tax/);
  assert.equal(gemini.includes('printed invoice total'), false);
  assert.equal(gemini.includes('equals sum of department totals'), false);
});
