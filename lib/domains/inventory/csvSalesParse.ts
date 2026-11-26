import { torontoYmd, zonedTimeToUtc } from '@/lib/domains/stats/storeTime';
import {
  CSV_SALES_MAX_ROWS,
  csvColumnMappingSchema,
  csvImportRowSchema,
  type CsvColumnMapping,
} from '@/lib/security/schemas/csvSalesImport';

/**
 * Square Transactions → Items Detail CSV.
 * Header row quoted from the Square Community post (seller export, not a Square staff spec):
 * https://community.squareup.com/t5/Square-Register/Tracking-Fees-with-Category-Reports/td-p/792045
 * Channel and Token are in that post. An older export without those two columns still matches.
 * Extra columns are ignored. Card Brand and PAN Suffix are not in the post.
 */
export const SQUARE_ITEMS_DETAIL_SOURCE =
  'https://community.squareup.com/t5/Square-Register/Tracking-Fees-with-Category-Reports/td-p/792045';

export const SQUARE_ITEMS_DETAIL_HEADERS = [
  'Date',
  'Time',
  'Time Zone',
  'Category',
  'Item',
  'Qty',
  'Price Point Name',
  'SKU',
  'Modifiers Applied',
  'Gross Sales',
  'Discounts',
  'Net Sales',
  'Tax',
  'Transaction ID',
  'Payment ID',
  'Device Name',
  'Notes',
  'Details',
  'Event Type',
  'Location',
  'Dining Option',
  'Customer ID',
  'Customer Name',
  'Customer Reference ID',
  'Unit',
  'Count',
  'GTIN',
  'Itemization Type',
  'Commission',
  'Employee',
  'Fulfillment Note',
  'Channel',
  'Token',
] as const;

/** Present on both the newer export and the older one that has no Channel or Token. */
export const SQUARE_REQUIRED_HEADERS = [
  'Date',
  'Item',
  'Qty',
  'Price Point Name',
  'SKU',
  'Gross Sales',
  'Net Sales',
  'Unit',
  'Transaction ID',
] as const;

/** Newer than the export that stopped at Fulfillment Note. Missing these is still the preset. */
export const SQUARE_OPTIONAL_NEWER_HEADERS = ['Channel', 'Token'] as const;

const SQUARE_DISTINCTIVE_HEADERS = [
  'Price Point Name',
  'Itemization Type',
  'Modifiers Applied',
  'Fulfillment Note',
  'Dining Option',
] as const;

export type CsvRowStatus = 'matched' | 'unknown' | 'bad' | 'duplicate' | 'refund';

export interface CsvPreviewRow {
  rowIndex: number;
  sku: string;
  itemName: string;
  variation: string;
  qty: number | null;
  unit: string;
  revenue: number | null;
  grossSales: number | null;
  soldAt: string | null;
  /** Toronto calendar date for this line. Null when the date cell cannot be read. */
  saleDate: string | null;
  externalRef: string | null;
  idempotencyKey: string | null;
  productId: string | null;
  productName: string | null;
  status: CsvRowStatus;
  issues: string[];
}

export interface CsvDayTotal {
  date: string;
  lines: number;
  qty: number;
  revenue: number;
}

export interface CsvSalesPreview {
  preset: 'square-items-detail' | null;
  headers: string[];
  mapping: CsvColumnMapping;
  dateRange: { from: string; to: string } | null;
  days: CsvDayTotal[];
  rows: CsvPreviewRow[];
  matched: CsvPreviewRow[];
  unknown: CsvPreviewRow[];
  bad: CsvPreviewRow[];
  duplicate: CsvPreviewRow[];
  refund: CsvPreviewRow[];
}

export type SkuHit = { productId: string; productName: string };

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

export function headerIndex(headers: readonly string[], name: string): number {
  const target = name.trim().toLowerCase();
  return headers.findIndex((header) => header.trim().toLowerCase() === target);
}

function hasHeader(headers: readonly string[], name: string): boolean {
  return headerIndex(headers, name) >= 0;
}

/**
 * Identity of one line inside a Square transaction.
 * The line index is the 0-based order of that transaction's rows in the file,
 * so a later weekly file posts the same receipt lines once.
 */
export function csvTransactionIdentity(input: {
  transactionId: string;
  item: string;
  variation: string;
  lineIndex: number;
}): string {
  return [input.transactionId, input.item, input.variation, String(input.lineIndex)]
    .map((part) => encodeURIComponent(part.trim()))
    .join(':');
}

/** Transaction line when a receipt id is present. Otherwise the file hash plus the row index. */
export function csvSaleIdempotencyKey(input: {
  fileSha256: string;
  rowIndex: number;
  transactionId?: string;
  item?: string;
  variation?: string;
  lineIndex?: number;
}): string {
  const transactionId = input.transactionId?.trim();
  if (transactionId) {
    return `sale:pos:${csvTransactionIdentity({
      transactionId,
      item: input.item ?? '',
      variation: input.variation ?? '',
      lineIndex: input.lineIndex ?? 0,
    })}`;
  }
  return `sale:csv:${input.fileSha256}:${input.rowIndex}`;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Build a synthetic Items Detail CSV. Values use the locked header names. */
export function squareItemsDetailCsv(
  rows: Array<Partial<Record<(typeof SQUARE_ITEMS_DETAIL_HEADERS)[number], string>>>
): string {
  const lines = [
    SQUARE_ITEMS_DETAIL_HEADERS.join(','),
    ...rows.map((row) => SQUARE_ITEMS_DETAIL_HEADERS.map((name) => csvEscape(row[name] ?? '')).join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n') {
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }

  if (inQuotes) throw new CsvParseError('A CSV quote was not closed.');
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }
  return rows;
}

/** Square US exports use M/D/YYYY. ISO dates stay year-month-day. Noon store time keeps the business date. */
export function parseSaleDate(raw: string): Date | null {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (slash) {
    month = Number(slash[1]);
    day = Number(slash[2]);
    year = Number(slash[3]);
  } else {
    return null;
  }
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const instant = zonedTimeToUtc(ymd, 12, 0, 0);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return instant;
}

export function parseMoney(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let negative = false;
  let body = trimmed;
  if (body.startsWith('(') && body.endsWith(')')) {
    negative = true;
    body = body.slice(1, -1).trim();
  }
  body = body.replace(/[$,\s]/g, '');
  if (body.startsWith('-')) {
    negative = true;
    body = body.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(body)) return null;
  const value = Number(body);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

export function parseQuantity(raw: string): number | null {
  const body = raw.trim().replace(/,/g, '');
  if (!body) return null;
  if (!/^-?\d+(\.\d+)?$/.test(body)) return null;
  const value = Number(body);
  if (!Number.isFinite(value)) return null;
  return value;
}

function squareMapping(headers: readonly string[]): CsvColumnMapping {
  const optional = (name: string) => (hasHeader(headers, name) ? name : undefined);
  return csvColumnMappingSchema.parse({
    sku: 'SKU',
    qty: 'Qty',
    unit: 'Unit',
    revenue: 'Net Sales',
    date: 'Date',
    itemName: optional('Item'),
    externalRef: optional('Transaction ID'),
    variation: optional('Price Point Name'),
    grossSales: optional('Gross Sales'),
  });
}

export function resolveImportMapping(
  headers: readonly string[],
  submitted: CsvColumnMapping | null
):
  | { ok: true; preset: 'square-items-detail' | null; mapping: CsvColumnMapping }
  | { ok: false; error: string } {
  const missing = SQUARE_REQUIRED_HEADERS.filter((name) => !hasHeader(headers, name));
  const distinctive = SQUARE_DISTINCTIVE_HEADERS.some((name) => hasHeader(headers, name));
  const officialHits = SQUARE_ITEMS_DETAIL_HEADERS.filter((name) => hasHeader(headers, name)).length;
  const squareFile = distinctive || officialHits >= 8;

  if (missing.length === 0 && (squareFile || officialHits >= SQUARE_REQUIRED_HEADERS.length)) {
    return { ok: true, preset: 'square-items-detail', mapping: squareMapping(headers) };
  }
  if (squareFile && missing.length > 0) {
    return {
      ok: false,
      error: `Missing required Square Items Detail columns: ${missing.join(', ')}.`,
    };
  }
  if (!submitted) {
    return {
      ok: false,
      error: 'Map the PLU/SKU, quantity, unit, line revenue, and date columns.',
    };
  }
  const parsed = csvColumnMappingSchema.safeParse(submitted);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Column mapping is invalid.' };
  }
  for (const name of [
    parsed.data.sku,
    parsed.data.qty,
    parsed.data.unit,
    parsed.data.revenue,
    parsed.data.date,
    parsed.data.externalRef,
    parsed.data.itemName,
    parsed.data.variation,
    parsed.data.grossSales,
  ]) {
    if (name && !hasHeader(headers, name)) {
      return { ok: false, error: `Column "${name}" was not found.` };
    }
  }
  return { ok: true, preset: null, mapping: parsed.data };
}

function cell(row: string[], index: number): string {
  if (index < 0) return '';
  return row[index] ?? '';
}

function dayRollup(rows: CsvPreviewRow[]): Pick<CsvSalesPreview, 'dateRange' | 'days'> {
  const byDate = new Map<string, CsvDayTotal>();
  for (const row of rows) {
    if (!row.saleDate || row.qty == null || row.revenue == null) continue;
    if (row.status === 'bad' || row.status === 'refund') continue;
    const current = byDate.get(row.saleDate) ?? {
      date: row.saleDate,
      lines: 0,
      qty: 0,
      revenue: 0,
    };
    current.lines += 1;
    current.qty = Number((current.qty + row.qty).toFixed(4));
    current.revenue = Number((current.revenue + row.revenue).toFixed(2));
    byDate.set(row.saleDate, current);
  }
  const days = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  const first = days[0];
  const last = days[days.length - 1];
  return {
    days,
    dateRange: first && last ? { from: first.date, to: last.date } : null,
  };
}

function groupPreview(
  preview: Omit<CsvSalesPreview, 'matched' | 'unknown' | 'bad' | 'duplicate' | 'refund' | 'dateRange' | 'days'> & {
    rows: CsvPreviewRow[];
  }
): CsvSalesPreview {
  const rollup = dayRollup(preview.rows);
  return {
    ...preview,
    ...rollup,
    matched: preview.rows.filter((row) => row.status === 'matched'),
    unknown: preview.rows.filter((row) => row.status === 'unknown'),
    bad: preview.rows.filter((row) => row.status === 'bad'),
    duplicate: preview.rows.filter((row) => row.status === 'duplicate'),
    refund: preview.rows.filter((row) => row.status === 'refund'),
  };
}

export function classifyCsvSales(input: {
  csv: string;
  mapping: CsvColumnMapping;
  fileSha256: string;
  resolveSku: (sku: string) => SkuHit | null;
  existingKeys?: ReadonlySet<string>;
}): { ok: true; preview: CsvSalesPreview } | { ok: false; error: string } {
  let table: string[][];
  try {
    table = parseCsv(input.csv);
  } catch (error) {
    if (error instanceof CsvParseError) return { ok: false, error: error.message };
    throw error;
  }
  if (table.length === 0) return { ok: false, error: 'The CSV has no header row.' };
  const headers = table[0] ?? [];
  const data = table.slice(1);
  if (data.length === 0) return { ok: false, error: 'The CSV has no data rows.' };
  if (data.length > CSV_SALES_MAX_ROWS) {
    return {
      ok: false,
      error: `This CSV has ${data.length} rows. The limit is ${CSV_SALES_MAX_ROWS}.`,
    };
  }

  const resolved = resolveImportMapping(headers, input.mapping);
  if (!resolved.ok) return resolved;
  const mapping = resolved.mapping;
  const skuAt = headerIndex(headers, mapping.sku);
  const qtyAt = headerIndex(headers, mapping.qty);
  const unitAt = headerIndex(headers, mapping.unit);
  const revenueAt = headerIndex(headers, mapping.revenue);
  const dateAt = headerIndex(headers, mapping.date);
  const refAt = mapping.externalRef ? headerIndex(headers, mapping.externalRef) : -1;
  const itemAt = mapping.itemName ? headerIndex(headers, mapping.itemName) : -1;
  const variationAt = mapping.variation ? headerIndex(headers, mapping.variation) : -1;
  const grossAt = mapping.grossSales ? headerIndex(headers, mapping.grossSales) : -1;
  const eventAt = headerIndex(headers, 'Event Type');
  const existing = input.existingKeys ?? new Set<string>();
  const seenKeys = new Set<string>();
  const transactionCounts = new Map<string, number>();
  const lineIndexByRow = new Map<number, number>();
  data.forEach((record, rowIndex) => {
    if (refAt < 0) return;
    const transactionId = cell(record, refAt).trim();
    if (!transactionId) return;
    const lineIndex = transactionCounts.get(transactionId) ?? 0;
    transactionCounts.set(transactionId, lineIndex + 1);
    lineIndexByRow.set(rowIndex, lineIndex);
  });

  const rows: CsvPreviewRow[] = data.map((record, rowIndex) => {
    const sku = cell(record, skuAt).trim();
    const itemName = cell(record, itemAt).trim();
    const variation = cell(record, variationAt).trim();
    const unit = cell(record, unitAt).trim();
    const externalRef = refAt >= 0 ? cell(record, refAt).trim() : '';
    const eventType = eventAt >= 0 ? cell(record, eventAt).trim() : '';
    const base = {
      rowIndex,
      sku,
      itemName,
      variation,
      unit,
      grossSales: grossAt >= 0 ? parseMoney(cell(record, grossAt)) : null,
      saleDate: null as string | null,
      externalRef: externalRef || null,
      idempotencyKey: null as string | null,
      productId: null as string | null,
      productName: null as string | null,
      soldAt: null as string | null,
    };

    const soldAtEarly = parseSaleDate(cell(record, dateAt));
    if (eventType.toLowerCase() === 'refund') {
      return {
        ...base,
        qty: parseQuantity(cell(record, qtyAt)),
        revenue: parseMoney(cell(record, revenueAt)),
        soldAt: soldAtEarly ? soldAtEarly.toISOString() : null,
        saleDate: soldAtEarly ? torontoYmd(soldAtEarly) : null,
        status: 'refund' as const,
        issues: ['Refunds are not posted.'],
      };
    }

    const issues: string[] = [];
    const qtyRaw = cell(record, qtyAt);
    const qty = parseQuantity(qtyRaw);
    if (!qtyRaw.trim()) issues.push('Quantity is missing.');
    else if (qty == null) issues.push('Quantity is not a number.');
    else if (qty < 0) issues.push('Quantity cannot be negative.');
    else if (qty === 0) issues.push('Quantity must be greater than zero.');

    const revenueRaw = cell(record, revenueAt);
    const revenue = parseMoney(revenueRaw);
    if (!revenueRaw.trim()) issues.push('Line revenue is missing.');
    else if (revenue == null) issues.push('Line revenue is not a number.');
    else if (revenue < 0) issues.push('Line revenue cannot be negative.');

    const soldAt = parseSaleDate(cell(record, dateAt));
    if (!cell(record, dateAt).trim()) issues.push('Date is missing.');
    else if (!soldAt) issues.push('Date could not be read.');

    if (!sku) issues.push('SKU is missing.');
    if (!unit) issues.push('Unit is missing.');

    if (issues.length === 0 && soldAt && qty != null && revenue != null) {
      const checked = csvImportRowSchema.safeParse({
        sku,
        qty,
        unit,
        revenue,
        soldAt,
        externalRef: externalRef || undefined,
      });
      if (!checked.success) {
        issues.push(checked.error.issues[0]?.message ?? 'This row is not valid.');
      }
    }

    const saleDate = soldAt ? torontoYmd(soldAt) : null;
    if (issues.length > 0 || qty == null || revenue == null || !soldAt) {
      return {
        ...base,
        qty,
        revenue,
        soldAt: soldAt ? soldAt.toISOString() : null,
        saleDate,
        status: 'bad' as const,
        issues,
      };
    }

    const idempotencyKey = csvSaleIdempotencyKey({
      fileSha256: input.fileSha256,
      rowIndex,
      transactionId: externalRef || undefined,
      item: itemName,
      variation,
      lineIndex: lineIndexByRow.get(rowIndex) ?? 0,
    });
    const shared = {
      ...base,
      qty,
      revenue,
      soldAt: soldAt.toISOString(),
      saleDate,
      idempotencyKey,
    };
    const hit = input.resolveSku(sku);
    if (!hit) {
      return { ...shared, status: 'unknown' as const, issues: [`SKU ${sku} is not mapped.`] };
    }
    if (seenKeys.has(idempotencyKey) || existing.has(idempotencyKey)) {
      seenKeys.add(idempotencyKey);
      return {
        ...shared,
        productId: hit.productId,
        productName: hit.productName,
        status: 'duplicate' as const,
        issues: ['This line was already posted.'],
      };
    }
    seenKeys.add(idempotencyKey);
    return {
      ...shared,
      productId: hit.productId,
      productName: hit.productName,
      status: 'matched' as const,
      issues: [],
    };
  });

  return {
    ok: true,
    preview: groupPreview({
      preset: resolved.preset,
      headers,
      mapping,
      rows,
    }),
  };
}
