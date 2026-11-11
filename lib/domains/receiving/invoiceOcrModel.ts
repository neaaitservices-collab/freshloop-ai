import { z } from 'zod';
import { CATALOG_DEPARTMENTS } from '@/lib/domains/inventory/inventoryCatalog';
import type { DepartmentType } from '@/lib/types';
import {
  parseInvoiceIdentity,
  readInvoiceDepartment,
  type ParsedInvoiceIdentity,
} from '@/lib/domains/receiving/invoiceOcrParse';

export const INVOICE_OCR_JSON_ERROR =
  'The invoice text could not be parsed as structured JSON. Try a clearer photo of the line-item table.';

export const INVOICE_OCR_NO_STOCK_ERROR = 'No stock lines on this invoice';

/** Caps repeated in the OCR prompt and enforced on the model payload. */
export const INVOICE_OCR_TEXT_LIMITS = {
  vendorName: 120,
  invoiceNumber: 64,
  lineName: 160,
  unit: 24,
  subUnit: 24,
} as const;

/** Printed line total may differ from qty × unit cost by this many dollars. */
export const INVOICE_LINE_TOTAL_TOLERANCE = 0.02;

const INVOICE_UNITS = new Set([
  'cases',
  'case',
  'cs',
  'ctn',
  'units',
  'unit',
  'each',
  'ea',
  'lbs',
  'lb',
  'kg',
  'g',
  'oz',
  'l',
  'ml',
  'loaves',
  'loaf',
  'bunches',
  'bunch',
  'tubs',
  'tub',
  'boxes',
  'box',
  'ct',
  'pk',
  'pack',
  'dz',
  'dozen',
  'bag',
  'bx',
  'pc',
  'pcs',
  'tray',
  'flat',
  'crate',
  'sack',
  'can',
  'jar',
  'bottle',
]);

function enumTuple<T extends string>(values: readonly T[]): [T, ...T[]] {
  const [first, ...rest] = values;
  if (!first) throw new Error('Department list is empty.');
  return [first, ...rest];
}

/** Trimmed numeric text, optional leading $, and thousands commas. Other text stays invalid. */
export function coerceInvoiceNumber(value: unknown): unknown {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;
  const text = value.trim().replace(/^\$/, '').trim();
  if (!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(text)) return value;
  const numeric = Number(text.replace(/,/g, ''));
  return Number.isFinite(numeric) ? numeric : value;
}

function invoiceNumberSchema<T extends z.ZodTypeAny>(check: T) {
  return z.preprocess(coerceInvoiceNumber, check);
}

export const invoiceOcrMoneySchema = invoiceNumberSchema(z.number().finite().nonnegative());
export const invoiceOcrQuantitySchema = invoiceNumberSchema(z.number().finite().positive());
/** Ordered and shipped counts may be zero. Received quantity uses shipped. */
export const invoiceOcrCountSchema = invoiceNumberSchema(z.number().finite().nonnegative());
const invoiceOcrCasePackSchema = invoiceNumberSchema(z.number().finite().positive());
export const invoiceOcrDepartmentSchema = z.enum(enumTuple(CATALOG_DEPARTMENTS));

/**
 * Strict shape of a model payload. interpretInvoiceOcrModel flags bad fields
 * instead of dropping a whole invoice when one line is incomplete.
 */
export const invoiceOcrModelSchema = z.object({
  vendorName: z.string().trim().min(1).max(INVOICE_OCR_TEXT_LIMITS.vendorName),
  invoiceNumber: z.string().trim().min(1).max(INVOICE_OCR_TEXT_LIMITS.invoiceNumber),
  invoiceDate: z.string().trim().min(1).max(40),
  /** Another printed date, such as the order date. Copied as printed. */
  orderDate: z.string().trim().max(40).optional(),
  terms: z.string().trim().max(40).optional(),
  subtotal: invoiceOcrMoneySchema.optional(),
  hst: invoiceOcrMoneySchema.optional(),
  pst: invoiceOcrMoneySchema.optional(),
  lineItems: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(INVOICE_OCR_TEXT_LIMITS.lineName),
        department: invoiceOcrDepartmentSchema,
        ordered: invoiceOcrCountSchema.optional(),
        shipped: invoiceOcrCountSchema.optional(),
        quantity: invoiceOcrQuantitySchema.optional(),
        unit: z.string().trim().min(1).max(INVOICE_OCR_TEXT_LIMITS.unit),
        code: z.string().trim().max(32).optional(),
        struckThrough: z.boolean().optional(),
        unitCost: invoiceOcrMoneySchema,
        totalCost: invoiceOcrMoneySchema,
      })
    )
    .min(1),
});

export interface InterpretedInvoiceLine {
  name: string;
  department: DepartmentType;
  quantity: number;
  unit: string;
  casePackSize: number;
  subUnit: string;
  unitCost: number;
  totalCost: number;
  caseRetailPrice: number | null;
  extractionConfidence: unknown;
  departmentAssumed: boolean;
  quantityUnreadable: boolean;
  costUnreadable: boolean;
  unitInvalid: boolean;
  lineTotalMismatch: boolean;
  lineTotalNote: string | null;
  postsStock: boolean;
  lineKind: 'stock' | 'charge' | 'zero';
  gaps: string[];
}

export interface InterpretedInvoiceModel {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  lineItems: InterpretedInvoiceLine[];
  excludedLines: InterpretedInvoiceLine[];
  subtotal: number | null;
  subtotalGap: string | null;
  gaps: string[];
  identity: ParsedInvoiceIdentity;
}

function cappedString(value: unknown, max: number): { text: string; missing: boolean; truncated: boolean } {
  if (typeof value !== 'string') return { text: '', missing: true, truncated: false };
  const trimmed = value.trim();
  if (!trimmed) return { text: '', missing: true, truncated: false };
  if (trimmed.length > max) return { text: trimmed.slice(0, max), missing: false, truncated: true };
  return { text: trimmed, missing: false, truncated: false };
}

function pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) return raw[key];
  }
  return undefined;
}

function moneyCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

function isAllowedUnit(value: string): boolean {
  return INVOICE_UNITS.has(value.trim().toLowerCase());
}

function readLine(raw: unknown, lineNumber: number): InterpretedInvoiceLine {
  const gaps: string[] = [];
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    gaps.push(`Line ${lineNumber} was not a line item.`);
  }

  const nameField = cappedString(pick(record, 'name', 'item_name'), INVOICE_OCR_TEXT_LIMITS.lineName);
  const name = nameField.missing ? `Unread line ${lineNumber}` : nameField.text;
  if (nameField.missing) gaps.push(`Line ${lineNumber} has no product name.`);
  if (nameField.truncated) gaps.push(`Line ${lineNumber} name was longer than ${INVOICE_OCR_TEXT_LIMITS.lineName} characters.`);

  const departmentFields = readInvoiceDepartment(pick(record, 'department'));
  if (departmentFields.departmentAssumed) {
    const token = typeof record.department === 'string' ? record.department.trim() : '';
    gaps.push(
      token
        ? `Line ${lineNumber} department "${token}" is not a department and needs review.`
        : `Line ${lineNumber} department was not read.`
    );
  }

  const shippedRaw = pick(record, 'shipped', 'shippedQty', 'shipped_qty');
  const quantityRaw = shippedRaw !== undefined ? shippedRaw : pick(record, 'quantity');
  const quantityParsed = invoiceOcrQuantitySchema.safeParse(quantityRaw);
  const quantityUnreadable = !quantityParsed.success;
  const quantity = quantityParsed.success ? quantityParsed.data : 0;
  if (quantityUnreadable) gaps.push(`Line ${lineNumber} quantity was not read.`);

  const unitField = cappedString(pick(record, 'unit'), INVOICE_OCR_TEXT_LIMITS.unit);
  const unit = unitField.text;
  const unitKnown = !unitField.missing && !unitField.truncated && isAllowedUnit(unit);
  if (!unitKnown) {
    const shown = unit || (typeof pick(record, 'unit') === 'string' ? String(pick(record, 'unit')).trim() : '');
    gaps.push(
      shown
        ? `Line ${lineNumber} unit "${shown.slice(0, INVOICE_OCR_TEXT_LIMITS.unit)}" is not a known unit.`
        : `Line ${lineNumber} unit was not read.`
    );
  }

  const costRaw = pick(record, 'unitCost', 'unit_cost');
  const costParsed = invoiceOcrMoneySchema.safeParse(costRaw);
  const costUnreadable = !costParsed.success;
  const unitCost = costParsed.success ? costParsed.data : 0;
  if (costUnreadable) gaps.push(`Line ${lineNumber} unit cost was not read.`);

  const packRaw = pick(record, 'casePackSize', 'case_pack_size');
  const packParsed = packRaw === undefined ? null : invoiceOcrCasePackSchema.safeParse(packRaw);
  let casePackSize = 1;
  if (packParsed?.success) casePackSize = packParsed.data;
  else if (packRaw !== undefined) gaps.push(`Line ${lineNumber} case pack was not read.`);

  const subField = cappedString(pick(record, 'subUnit', 'sub_unit'), INVOICE_OCR_TEXT_LIMITS.subUnit);
  const subUnit = subField.missing ? 'units' : subField.text;

  const totalRaw = pick(record, 'totalCost', 'total_cost');
  const extended =
    !quantityUnreadable && !costUnreadable ? Number((quantity * unitCost).toFixed(2)) : 0;
  let totalCost = extended;
  let lineTotalMismatch = false;
  let lineTotalNote: string | null = null;
  if (!quantityUnreadable && !costUnreadable && totalRaw !== undefined) {
    const printed = invoiceOcrMoneySchema.safeParse(totalRaw);
    if (!printed.success) {
      lineTotalMismatch = true;
      lineTotalNote = `Line ${lineNumber} unit cost ${unitCost.toFixed(2)} kept. The printed line total was not a number.`;
      gaps.push(lineTotalNote);
    } else if (Math.abs(moneyCents(printed.data) - moneyCents(extended)) > Math.round(INVOICE_LINE_TOTAL_TOLERANCE * 100)) {
      lineTotalMismatch = true;
      const gap = Number((printed.data - extended).toFixed(2));
      lineTotalNote = `Line ${lineNumber} unit cost ${unitCost.toFixed(2)} × ${quantity} = ${extended.toFixed(2)}; printed total ${printed.data.toFixed(2)} (gap ${gap.toFixed(2)}).`;
      gaps.push(lineTotalNote);
    } else {
      totalCost = printed.data;
    }
  } else if (!quantityUnreadable && !costUnreadable && totalRaw === undefined) {
    gaps.push(`Line ${lineNumber} total was not read. Unit cost ${unitCost.toFixed(2)} kept.`);
  }

  const retailRaw = pick(record, 'caseRetailPrice', 'case_retail_price', 'retail_price');
  const retailParsed = retailRaw === undefined || retailRaw === null ? null : invoiceOcrMoneySchema.safeParse(retailRaw);
  const caseRetailPrice = retailParsed?.success && retailParsed.data > 0 ? retailParsed.data : null;

  return {
    name,
    department: departmentFields.department,
    quantity,
    unit,
    casePackSize,
    subUnit,
    unitCost,
    totalCost,
    caseRetailPrice,
    extractionConfidence: pick(record, 'extractionConfidence', 'extraction_confidence', 'confidence'),
    departmentAssumed: departmentFields.departmentAssumed,
    quantityUnreadable,
    costUnreadable,
    unitInvalid: false,
    lineTotalMismatch,
    lineTotalNote,
    postsStock: true,
    lineKind: 'stock',
    gaps,
  };
}

const CHARGE_UNITS = new Set(['chrg', 'charge']);

function isExplicitZero(value: unknown): boolean {
  return coerceInvoiceNumber(value) === 0;
}

function isStruckLine(record: Record<string, unknown>): boolean {
  const flag = record.struckThrough ?? record.struck ?? record.struck_through;
  return flag === true || flag === 'true';
}

function isChargeLine(record: Record<string, unknown>, unit: string): boolean {
  if (record.charge === true || record.lineKind === 'charge') return true;
  return CHARGE_UNITS.has(unit.trim().toLowerCase());
}

function classifyInvoiceLine(line: InterpretedInvoiceLine, raw: unknown): InterpretedInvoiceLine {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const printedTotal = pick(record, 'totalCost', 'total_cost');
  const shippedRaw = pick(record, 'shipped', 'shippedQty', 'shipped_qty');
  const printedQty = shippedRaw !== undefined ? shippedRaw : pick(record, 'quantity');
  if (isChargeLine(record, line.unit)) {
    return {
      ...line,
      postsStock: false,
      lineKind: 'charge',
      quantityUnreadable: false,
      gaps: [`Line ${line.name} is a charge and is not received into stock.`],
    };
  }
  if ((isStruckLine(record) || isExplicitZero(printedQty)) && isExplicitZero(printedTotal)) {
    return {
      ...line,
      quantity: 0,
      totalCost: 0,
      postsStock: false,
      lineKind: 'zero',
      quantityUnreadable: false,
      gaps: [`${line.name} shipped 0 at $0.00 and is not received.`],
    };
  }
  return line;
}

export function interpretInvoiceOcrModel(
  raw: unknown,
  options?: { receivedOn?: string | null }
): InterpretedInvoiceModel {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(INVOICE_OCR_JSON_ERROR);
  }
  const record = raw as Record<string, unknown>;
  const lines = record.lineItems ?? record.line_items;
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error(INVOICE_OCR_JSON_ERROR);
  }

  const vendor = cappedString(record.vendorName ?? record.vendor_name, INVOICE_OCR_TEXT_LIMITS.vendorName);
  const invoiceNumber = cappedString(
    record.invoiceNumber ?? record.invoice_number,
    INVOICE_OCR_TEXT_LIMITS.invoiceNumber
  );
  const identity = parseInvoiceIdentity({
    vendorName: vendor.text,
    invoiceNumber: invoiceNumber.text,
    invoiceDate: record.invoiceDate ?? record.invoice_date,
    orderDate: record.orderDate ?? record.order_date,
    receivedOn: options?.receivedOn,
  });
  const gaps = [...identity.gaps];
  if (vendor.truncated) gaps.push(`Vendor name was longer than ${INVOICE_OCR_TEXT_LIMITS.vendorName} characters.`);
  if (invoiceNumber.truncated) {
    gaps.push(`Invoice number was longer than ${INVOICE_OCR_TEXT_LIMITS.invoiceNumber} characters.`);
  }

  const classified = lines.map((line, index) => classifyInvoiceLine(readLine(line, index + 1), line));
  const lineItems = classified.filter((line) => line.postsStock);
  if (lineItems.length === 0) {
    throw new Error(INVOICE_OCR_NO_STOCK_ERROR);
  }
  const excludedLines = classified.filter((line) => !line.postsStock);
  const lineSum = Number(classified.reduce((sum, line) => sum + line.totalCost, 0).toFixed(2));
  const printedSubtotal = pick(record, 'subtotal', 'subTotal');
  let subtotal: number | null = null;
  let subtotalGap: string | null = null;
  if (printedSubtotal !== undefined) {
    const parsedSubtotal = invoiceOcrMoneySchema.safeParse(printedSubtotal);
    if (!parsedSubtotal.success) {
      subtotalGap = 'Invoice subtotal was not a number.';
    } else {
      subtotal = parsedSubtotal.data;
      if (Math.abs(moneyCents(subtotal) - moneyCents(lineSum)) > Math.round(INVOICE_LINE_TOTAL_TOLERANCE * 100)) {
        subtotalGap = `Invoice subtotal ${subtotal.toFixed(2)} does not match the line sum ${lineSum.toFixed(2)}.`;
      }
    }
  }
  if (subtotalGap) gaps.push(subtotalGap);
  for (const line of classified) gaps.push(...line.gaps);

  return {
    vendorName: identity.vendorName,
    invoiceNumber: identity.invoiceNumber,
    invoiceDate: identity.invoiceDate,
    lineItems,
    excludedLines,
    subtotal,
    subtotalGap,
    gaps,
    identity,
  };
}
