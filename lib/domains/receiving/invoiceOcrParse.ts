import { CATALOG_DEPARTMENTS } from '@/lib/domains/inventory/inventoryCatalog';
import type { DepartmentType } from '@/lib/types';
import { canonicalInvoiceDate } from '@/lib/domains/receiving/invoiceDeliveryId';

export interface ParsedInvoiceIdentity {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  gaps: string[];
}

export interface ParsedInvoiceLineFields {
  name: string;
  department: 'PRODUCE' | 'DAIRY' | 'BAKERY' | 'PANTRY' | 'DELI_KITCHEN' | 'GROCERY';
  quantity: number;
  unit: string;
  departmentAssumed: boolean;
  quantityUnreadable: boolean;
  gaps: string[];
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_NAME =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

function calendarDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function writtenInvoiceDate(text: string): string | null {
  const monthFirst = new RegExp(`^(${MONTH_NAME})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})$`, 'i').exec(
    text
  );
  if (monthFirst) {
    const month = MONTH_INDEX[monthFirst[1].toLowerCase()];
    return calendarDate(Number(monthFirst[3]), month, Number(monthFirst[2]));
  }
  const dayFirst = new RegExp(
    `^(\\d{1,2})(?:st|nd|rd|th)?[-\\s]+(${MONTH_NAME})\\.?[-\\s,]+(\\d{4})$`,
    'i'
  ).exec(text);
  if (dayFirst) {
    const month = MONTH_INDEX[dayFirst[2].toLowerCase()];
    return calendarDate(Number(dayFirst[3]), month, Number(dayFirst[1]));
  }
  return null;
}

/**
 * OCR dates only. Year-first values use the identity normalizer.
 * A written month is accepted. Ambiguous numeric dates such as 01/02/2026 are flagged.
 */
export function parseOcrInvoiceDate(raw: unknown): { invoiceDate: string; gap: string | null } {
  if (typeof raw !== 'string') {
    return {
      invoiceDate: '',
      gap: raw == null || raw === '' ? 'Invoice date was not read.' : 'Invoice date was not a real calendar date.',
    };
  }
  const text = raw.trim();
  if (!text) return { invoiceDate: '', gap: 'Invoice date was not read.' };
  const iso = canonicalInvoiceDate(text);
  if (iso) return { invoiceDate: iso, gap: null };
  const prefixed = /^(\d{4}-\d{2}-\d{2})[T\s]/.exec(text);
  if (prefixed) {
    const dated = canonicalInvoiceDate(prefixed[1]);
    if (dated) return { invoiceDate: dated, gap: null };
  }
  const written = writtenInvoiceDate(text);
  if (written) return { invoiceDate: written, gap: null };
  const shown = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  return { invoiceDate: '', gap: `Invoice date "${shown}" is not a real calendar date.` };
}

/** Keep a missing invoice identity blank. Do not mint a number or a vendor. */
export function parseInvoiceIdentity(raw: {
  vendorName?: unknown;
  invoiceNumber?: unknown;
  invoiceDate?: unknown;
}): ParsedInvoiceIdentity {
  const vendorName = typeof raw.vendorName === 'string' ? raw.vendorName.trim() : '';
  const invoiceNumber = typeof raw.invoiceNumber === 'string' ? raw.invoiceNumber.trim() : '';
  const date = parseOcrInvoiceDate(raw.invoiceDate);
  const gaps: string[] = [];
  if (!vendorName) gaps.push('Vendor name was not read.');
  if (!invoiceNumber) gaps.push('Invoice number was not read.');
  if (date.gap) gaps.push(date.gap);
  return {
    vendorName,
    invoiceNumber,
    invoiceDate: date.invoiceDate,
    gaps,
  };
}

export function readInvoiceDepartment(value: unknown): {
  department: DepartmentType;
  departmentAssumed: boolean;
} {
  const token = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if ((CATALOG_DEPARTMENTS as readonly string[]).includes(token)) {
    return { department: token as DepartmentType, departmentAssumed: false };
  }
  return { department: 'PRODUCE', departmentAssumed: true };
}

/**
 * A missing quantity stays 0 so receiving cannot post an invented case.
 * An unknown department is flagged. PRODUCE is only the placeholder until a clerk or a name signal chooses one.
 */
export function parseInvoiceLineFields(
  raw: Record<string, unknown>,
  lineNumber: number
): ParsedInvoiceLineFields {
  const gaps: string[] = [];
  const rawName = String(raw.name ?? raw.item_name ?? '').trim();
  const name = rawName || `Unread line ${lineNumber}`;
  if (!rawName) gaps.push(`Line ${lineNumber} has no product name.`);

  const departmentFields = readInvoiceDepartment(raw.department);
  const department = departmentFields.department;
  const departmentAssumed = departmentFields.departmentAssumed;
  if (departmentAssumed) {
    const token = String(raw.department ?? '').trim();
    gaps.push(
      token
        ? `Line ${lineNumber} department "${token}" is not a department and needs review.`
        : `Line ${lineNumber} department was not read.`
    );
  }

  const parsedQty = Number(raw.quantity);
  const quantityUnreadable = !(Number.isFinite(parsedQty) && parsedQty > 0);
  const quantity = quantityUnreadable ? 0 : parsedQty;
  if (quantityUnreadable) gaps.push(`Line ${lineNumber} quantity was not read.`);

  const unit = typeof raw.unit === 'string' ? raw.unit.trim() : '';
  return { name, department, quantity, unit, departmentAssumed, quantityUnreadable, gaps };
}
