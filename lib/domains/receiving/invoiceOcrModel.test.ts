import assert from 'node:assert/strict';
import test from 'node:test';
import { tryParseModelJson } from '@/lib/domains/ai/gemini';
import { buildAuthoritativeOcrDraft } from '@/lib/domains/receiving/invoiceOcrDraft';
import {
  interpretInvoiceOcrModel,
  invoiceOcrModelSchema,
  invoiceOcrQuantitySchema,
} from '@/lib/domains/receiving/invoiceOcrModel';

test('malformed model JSON is rejected and a bad line is flagged', () => {
  assert.equal(tryParseModelJson('{"lineItems":'), null);
  assert.throws(() => interpretInvoiceOcrModel({ vendorName: 'North' }), /structured JSON/);
  assert.equal(invoiceOcrQuantitySchema.safeParse('4').success, false);
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
        quantity: '4',
        unit: 'pallets',
        unitCost: -1,
        totalCost: 10,
      },
    ],
  });
  assert.equal(flagged.invoiceDate, '');
  assert.match(flagged.gaps.join(' '), /not a real calendar date/);
  assert.equal(flagged.lineItems[0]?.department, 'PRODUCE');
  assert.equal(flagged.lineItems[0]?.departmentAssumed, true);
  assert.equal(flagged.lineItems[0]?.quantity, 0);
  assert.equal(flagged.lineItems[0]?.quantityUnreadable, true);
  assert.equal(flagged.lineItems[0]?.unitCost, 0);
  assert.equal(flagged.lineItems[0]?.costUnreadable, true);
  assert.equal(flagged.lineItems[0]?.unitInvalid, true);
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
  assert.ok(draft.lines[0]?.review_reasons?.includes('unit_invalid'));
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
