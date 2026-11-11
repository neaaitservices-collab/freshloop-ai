import assert from 'node:assert/strict';
import test from 'node:test';
import { tryParseModelJson } from '@/lib/domains/ai/gemini';
import { buildAuthoritativeOcrDraft } from '@/lib/domains/receiving/invoiceOcrDraft';
import {
  interpretInvoiceOcrModel,
  invoiceOcrModelSchema,
  invoiceOcrMoneySchema,
  invoiceOcrQuantitySchema,
} from '@/lib/domains/receiving/invoiceOcrModel';

test('malformed model JSON is rejected and a bad line is flagged', () => {
  assert.equal(tryParseModelJson('{"lineItems":'), null);
  assert.throws(() => interpretInvoiceOcrModel({ vendorName: 'North' }), /structured JSON/);
  assert.equal(invoiceOcrQuantitySchema.safeParse('lots').success, false);
  assert.equal(invoiceOcrQuantitySchema.safeParse(Number.POSITIVE_INFINITY).success, false);
  assert.equal(invoiceOcrModelSchema.safeParse({ lineItems: [] }).success, false);

  const flagged = interpretInvoiceOcrModel({
    vendorName: 'North Market',
    invoiceNumber: 'INV-1',
    invoiceDate: '01/02/2026',
    lineItems: [
      {
        name: 'Apples',
        department: 'FROZEN',
        quantity: 'lots',
        unit: 'pallets',
        unitCost: -1,
        totalCost: 10,
      },
    ],
  });
  assert.equal(flagged.invoiceDate, '');
  assert.match(flagged.gaps.join(' '), /ambiguous/);
  assert.equal(flagged.lineItems[0]?.department, 'PRODUCE');
  assert.equal(flagged.lineItems[0]?.departmentAssumed, true);
  assert.equal(flagged.lineItems[0]?.quantity, 0);
  assert.equal(flagged.lineItems[0]?.quantityUnreadable, true);
  assert.equal(flagged.lineItems[0]?.unitCost, 0);
  assert.equal(flagged.lineItems[0]?.costUnreadable, true);
  assert.equal(flagged.lineItems[0]?.unitInvalid, false);
  assert.match(flagged.lineItems[0]?.gaps.join(' ') ?? '', /unit "pallets" is not a known unit/);
  const draft = buildAuthoritativeOcrDraft({
    vendorName: flagged.vendorName,
    invoiceNumber: flagged.invoiceNumber,
    invoiceDate: flagged.invoiceDate,
    totalAmount: 0,
    departmentBreakdown: { PRODUCE: 0 },
    lines: flagged.lineItems.map((line) => ({
      item_name: line.name,
      product_id: null,
      quantity: line.quantity,
      unit: line.unit,
      unit_cost: line.unitCost,
      department: line.department,
      case_pack_size: line.casePackSize,
      line_confidence: 0.99,
      requires_approval: false,
      department_assumed: line.departmentAssumed,
      quantity_unreadable: line.quantityUnreadable,
      cost_unreadable: line.costUnreadable,
      unit_invalid: line.unitInvalid,
      line_total_mismatch: line.lineTotalMismatch,
    })),
  });
  assert.ok(draft.lines[0]?.review_reasons?.includes('department_assumed'));
  assert.ok(draft.lines[0]?.review_reasons?.includes('quantity_unreadable'));
  assert.ok(draft.lines[0]?.review_reasons?.includes('cost_unreadable'));
  assert.equal(draft.lines[0]?.review_reasons?.includes('unit_invalid'), false);
});

test('numeric strings are coerced and an unknown unit is only a note', () => {
  assert.equal(invoiceOcrQuantitySchema.safeParse('4').data, 4);
  assert.equal(invoiceOcrMoneySchema.safeParse('  $1,250.50 ').data, 1250.5);
  assert.equal(invoiceOcrMoneySchema.safeParse('4.50').data, 4.5);
  assert.equal(invoiceOcrQuantitySchema.safeParse('4 cases').success, false);
  assert.equal(invoiceOcrMoneySchema.safeParse('$-2').success, false);

  const model = interpretInvoiceOcrModel({
    vendorName: 'North Market',
    invoiceNumber: 'INV-4',
    invoiceDate: '2026-11-08',
    lineItems: [
      {
        name: 'Apples',
        department: 'PRODUCE',
        quantity: '2',
        unit: 'Tray',
        casePackSize: '12',
        unitCost: '$4.50',
        totalCost: '9.00',
      },
      {
        name: 'Pears',
        department: 'PRODUCE',
        quantity: 1,
        unit: 'pallets',
        unitCost: 3,
        totalCost: 3,
      },
    ],
  });
  const apples = model.lineItems[0];
  assert.ok(apples);
  assert.equal(apples.quantity, 2);
  assert.equal(apples.quantityUnreadable, false);
  assert.equal(apples.unitCost, 4.5);
  assert.equal(apples.costUnreadable, false);
  assert.equal(apples.totalCost, 9);
  assert.equal(apples.casePackSize, 12);
  assert.equal(apples.unit, 'Tray');
  assert.equal(apples.lineTotalMismatch, false);
  const pears = model.lineItems[1];
  assert.ok(pears);
  assert.equal(pears.unitInvalid, false);
  assert.match(pears.gaps.join(' '), /not a known unit/);
  const draft = buildAuthoritativeOcrDraft({
    vendorName: model.vendorName,
    invoiceNumber: model.invoiceNumber,
    invoiceDate: model.invoiceDate,
    totalAmount: 12,
    departmentBreakdown: { PRODUCE: 12 },
    lines: model.lineItems.map((line) => ({
      item_name: line.name,
      product_id: null,
      quantity: line.quantity,
      unit: line.unit,
      unit_cost: line.unitCost,
      department: line.department,
      case_pack_size: line.casePackSize,
      line_confidence: 0.99,
      requires_approval: false,
      quantity_unreadable: line.quantityUnreadable,
      unit_invalid: line.unitInvalid,
    })),
  });
  assert.equal(draft.lines[1]?.review_reasons?.includes('unit_invalid'), false);
});

test('a mismatched line total is flagged and the unit cost is kept', () => {
  const model = interpretInvoiceOcrModel({
    vendorName: 'North Market',
    invoiceNumber: 'INV-2',
    invoiceDate: 'November 8, 2026',
    lineItems: [
      {
        name: 'Apples',
        department: 'GROCERY',
        quantity: 4,
        unit: 'cases',
        unitCost: 2.5,
        totalCost: 12,
      },
    ],
  });
  assert.equal(model.invoiceDate, '2026-11-08');
  const line = model.lineItems[0];
  assert.ok(line);
  assert.equal(line.department, 'GROCERY');
  assert.equal(line.departmentAssumed, false);
  assert.equal(line.unitCost, 2.5);
  assert.equal(line.totalCost, 10);
  assert.equal(line.lineTotalMismatch, true);
  assert.match(line.lineTotalNote ?? '', /2\.50/);
  assert.match(line.lineTotalNote ?? '', /12\.00/);
  assert.match(line.lineTotalNote ?? '', /gap 2\.00/);

  const close = interpretInvoiceOcrModel({
    vendorName: 'North Market',
    invoiceNumber: 'INV-3',
    invoiceDate: '2026-11-08',
    lineItems: [
      {
        name: 'Pears',
        department: 'PRODUCE',
        quantity: 3,
        unit: 'cases',
        unitCost: 1.11,
        totalCost: 3.34,
      },
    ],
  });
  assert.equal(close.lineItems[0]?.lineTotalMismatch, false);
  assert.equal(close.lineItems[0]?.unitCost, 1.11);
});

test('an invoice with only charges and zero lines is rejected before a draft', () => {
  assert.throws(
    () =>
      interpretInvoiceOcrModel({
        vendorName: 'North Market',
        invoiceNumber: 'INV-0',
        invoiceDate: '2026-11-08',
        subtotal: 0,
        lineItems: [
          {
            name: 'Old Bananas',
            quantity: 0,
            unit: 'cases',
            unitCost: 0,
            totalCost: 0,
            struckThrough: true,
          },
          {
            name: 'FUEL SURCHARGE',
            quantity: 1,
            unit: 'CHRG',
            unitCost: 0,
            totalCost: 0,
          },
        ],
      }),
    /No stock lines on this invoice/
  );
});

test('a hand-written invoice fixture keeps stock math and drops non-stock lines', () => {
  const fixture = {
    vendorName: 'North Market',
    invoiceNumber: 'INV-55',
    invoiceDate: '05-11-2026',
    subtotal: 169.5,
    lineItems: [
      {
        name: 'Old Bananas',
        quantity: 0,
        unit: 'cases',
        unitCost: 0,
        totalCost: 0,
        struckThrough: true,
      },
      {
        name: 'Mixed Greens',
        quantity: 2,
        unit: 'FLAT',
        unitCost: 84.75,
        totalCost: 169.5,
      },
      {
        name: 'FUEL SURCHARGE',
        quantity: 1,
        unit: 'CHRG',
        unitCost: 0,
        totalCost: 0,
      },
    ],
  };
  const model = interpretInvoiceOcrModel(fixture);
  assert.equal(model.invoiceDate, '');
  assert.match(model.gaps.join(' '), /05-11-2026/);
  assert.match(model.gaps.join(' '), /ambiguous/);
  assert.equal(model.lineItems.length, 1);
  const flat = model.lineItems[0];
  assert.ok(flat);
  assert.equal(flat.name, 'Mixed Greens');
  assert.equal(flat.quantity, 2);
  assert.equal(flat.unit, 'FLAT');
  assert.equal(flat.unitCost, 84.75);
  assert.equal(flat.totalCost, 169.5);
  assert.equal(flat.lineTotalMismatch, false);
  assert.equal(flat.postsStock, true);
  assert.equal(model.excludedLines.length, 2);
  assert.equal(model.excludedLines[0]?.lineKind, 'zero');
  assert.equal(model.excludedLines[0]?.quantity, 0);
  assert.equal(model.excludedLines[0]?.postsStock, false);
  assert.equal(model.excludedLines[1]?.lineKind, 'charge');
  assert.equal(model.excludedLines[1]?.postsStock, false);
  assert.match(model.excludedLines[1]?.gaps.join(' ') ?? '', /charge/);
  assert.equal(model.subtotal, 169.5);
  assert.equal(model.subtotalGap, null);

  const off = interpretInvoiceOcrModel({ ...fixture, subtotal: 200 });
  assert.match(off.subtotalGap ?? '', /does not match the line sum 169.50/);
});
