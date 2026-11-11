import { CATALOG_DEPARTMENTS } from '@/lib/domains/inventory/inventoryCatalog';
import type { DepartmentType } from '@/lib/types';
import { canonicalInvoiceDate } from '@/lib/domains/receiving/invoiceDeliveryId';
import { torontoToday } from '@/lib/domains/stats/storeTime';

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

export interface OcrInvoiceDateOptions {
  /** YYYY-MM-DD day the delivery is received. Defaults to the store's today. */
  receivedOn?: string | null;
  /** Another printed date, such as an order date, that can confirm one reading. */
  orderDate?: unknown;
}

type DateOrder = 'DD-MM' | 'MM-DD';

interface DateReading {
  iso: string;
  order: DateOrder;
}

function fullYear(year: number, digits: number): number {
  if (digits === 4) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function numericReadings(text: string): DateReading[] {
  const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(text);
  if (!match) return [];
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = fullYear(Number(match[3]), match[3].length);
  const readings: DateReading[] = [];
  const dayFirst = calendarDate(year, second, first);
  const monthFirst = calendarDate(year, first, second);
  if (dayFirst) readings.push({ iso: dayFirst, order: 'DD-MM' });
  if (monthFirst && monthFirst !== dayFirst) readings.push({ iso: monthFirst, order: 'MM-DD' });
  return readings;
}

function utcDay(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Every calendar date a second printed field could mean, including a short year. */
function dateCandidates(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  const text = raw.trim();
  if (!text) return [];
  const found = new Set<string>();
  const iso = canonicalInvoiceDate(text);
  if (iso) found.add(iso);
  const prefixed = /^(\d{4}-\d{2}-\d{2})[T\s]/.exec(text);
  if (prefixed) {
    const dated = canonicalInvoiceDate(prefixed[1]);
    if (dated) found.add(dated);
  }
  const written = writtenInvoiceDate(text);
  if (written) found.add(written);
  for (const reading of numericReadings(text)) found.add(reading.iso);
  return [...found];
}

function receiveDay(receivedOn: string | null | undefined): string {
  return canonicalInvoiceDate(receivedOn) ?? torontoToday();
}

function readingNote(reading: DateReading): string {
  return `${reading.iso} (${reading.order})`;
}

function chooseAmbiguousReading(
  readings: DateReading[],
  remaining: DateReading[],
  receive: string,
  orderDate: unknown
): { iso: string; note: string } {
  const only = remaining.length === 1 ? remaining[0] : undefined;
  if (only) {
    const dropped = readings.find((reading) => reading.iso !== only.iso);
    const because = dropped
      ? `${readingNote(dropped)} is after the receive date ${receive}`
      : `the other reading is after the receive date ${receive}`;
    return { iso: only.iso, note: `Read as ${readingNote(only)} because ${because}.` };
  }

  const matched = remaining.filter((reading) => dateCandidates(orderDate).includes(reading.iso));
  const confirmed = matched.length === 1 ? matched[0] : undefined;
  if (confirmed) {
    return {
      iso: confirmed.iso,
      note: `Read as ${readingNote(confirmed)} because it matches the order date.`,
    };
  }

  const [first, second] = remaining;
  if (!first || !second) {
    return { iso: '', note: `Both readings are after the receive date ${receive}.` };
  }
  const firstDistance = Math.abs(utcDay(first.iso) - utcDay(receive));
  const secondDistance = Math.abs(utcDay(second.iso) - utcDay(receive));
  if (firstDistance === secondDistance) {
    const dayFirst = first.order === 'DD-MM' ? first : second;
    const monthFirst = first.order === 'MM-DD' ? first : second;
    return {
      iso: dayFirst.iso,
      note: `Read as ${readingNote(dayFirst)}. ${readingNote(dayFirst)} and ${readingNote(monthFirst)} are equally close to the receive date ${receive}, so DD-MM was kept.`,
    };
  }
  const closer = firstDistance < secondDistance ? first : second;
  const farther = closer === first ? second : first;
  return {
    iso: closer.iso,
    note: `Read as ${readingNote(closer)}, closer to the receive date ${receive} than ${readingNote(farther)}.`,
  };
}

function resolveNumericInvoiceDate(
  text: string,
  shown: string,
  options?: OcrInvoiceDateOptions
): { invoiceDate: string; gap: string | null } {
  const readings = numericReadings(text);
  if (readings.length === 0) {
    return { invoiceDate: '', gap: `Invoice date "${shown}" is not a real calendar date.` };
  }
  const only = readings.length === 1 ? readings[0] : undefined;
  if (only) return { invoiceDate: only.iso, gap: null };

  const receive = receiveDay(options?.receivedOn);
  const receiveNumber = utcDay(receive);
  const remaining = readings.filter((reading) => utcDay(reading.iso) <= receiveNumber);
  if (remaining.length === 0) {
    return {
      invoiceDate: '',
      gap: `Invoice date "${shown}" is ambiguous. Both readings are after the receive date ${receive}.`,
    };
  }
  const choice = chooseAmbiguousReading(readings, remaining, receive, options?.orderDate);
  return {
    invoiceDate: choice.iso,
    gap: `Invoice date "${shown}" is ambiguous. ${choice.note} Confirm this date.`,
  };
}

/**
 * OCR dates only. Year-first values use the identity normalizer.
 * A written month is accepted. A numeric date with one valid reading is that date.
 * When both the day and the month are 12 or under, both readings are considered,
 * one is prefilled, and the clerk still has to confirm it.
 */
export function parseOcrInvoiceDate(
  raw: unknown,
  options?: OcrInvoiceDateOptions
): { invoiceDate: string; gap: string | null } {
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
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/.test(text)) {
    return resolveNumericInvoiceDate(text, shown, options);
  }
  return { invoiceDate: '', gap: `Invoice date "${shown}" is not a real calendar date.` };
}

/** Keep a missing invoice identity blank. Do not mint a number or a vendor. */
export function parseInvoiceIdentity(raw: {
  vendorName?: unknown;
  invoiceNumber?: unknown;
  invoiceDate?: unknown;
  orderDate?: unknown;
  receivedOn?: string | null;
}): ParsedInvoiceIdentity {
  const vendorName = typeof raw.vendorName === 'string' ? raw.vendorName.trim() : '';
  const invoiceNumber = typeof raw.invoiceNumber === 'string' ? raw.invoiceNumber.trim() : '';
  const date = parseOcrInvoiceDate(raw.invoiceDate, {
    receivedOn: raw.receivedOn,
    orderDate: raw.orderDate,
  });
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
