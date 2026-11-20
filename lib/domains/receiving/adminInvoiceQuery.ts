import type { Prisma } from '@prisma/client';
import {
  canonicalInvoiceDate,
  canonicalInvoiceNumber,
  compactInvoiceNumber,
} from '@/lib/domains/receiving/invoiceDeliveryId';

/**
 * Page size for the admin invoice directory. One extra row is read so the
 * next page link only appears when another row exists.
 */
export const ADMIN_INVOICE_PAGE_SIZE = 50;

/** Saved supplier and invoice document ids. Rejects anything that is not an id. */
const RECORD_ID = /^[a-z0-9]{20,32}$/;

export function isAdminInvoiceRecordId(value: string): boolean {
  return RECORD_ID.test(value);
}

export interface AdminInvoiceListInput {
  invoiceNumber?: string | null;
  supplierId?: string | null;
  from?: string | null;
  to?: string | null;
  cursor?: string | null;
}

export interface AdminInvoiceNormalizedKey {
  /** `canonicalInvoiceNumber` result. Stored on `SupplierInvoiceDocument.invoiceKey`. */
  invoiceKey: string | null;
  /**
   * `compactInvoiceNumber` of that key. Stored on `invoiceKeyCompact`.
   * Equality on `(supplierId, invoiceKeyCompact)` is `@@index([supplierId, invoiceKeyCompact])`.
   */
  invoiceKeyCompact: string | null;
}

export interface AdminInvoiceListLookup {
  where: Prisma.SupplierInvoiceDocumentWhereInput;
  orderBy: Prisma.SupplierInvoiceDocumentOrderByWithRelationInput[];
  take: number;
  cursor?: { id: string };
  skip?: number;
}

export type AdminInvoiceListQuery =
  | { ok: false; error: string }
  | {
      ok: true;
      skipQuery: true;
      notice: string;
      normalized: AdminInvoiceNormalizedKey;
    }
  | {
      ok: true;
      skipQuery: false;
      notice: null;
      normalized: AdminInvoiceNormalizedKey;
      lookup: AdminInvoiceListLookup;
    };

const LIST_ORDER: Prisma.SupplierInvoiceDocumentOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

function blankKey(): AdminInvoiceNormalizedKey {
  return { invoiceKey: null, invoiceKeyCompact: null };
}

function firstSearchValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Map the admin invoice page query string onto the list filter. */
export function readAdminInvoiceListInput(
  searchParams: Record<string, string | string[] | undefined>
): AdminInvoiceListInput {
  return {
    invoiceNumber: firstSearchValue(searchParams.q),
    supplierId: firstSearchValue(searchParams.supplier),
    from: firstSearchValue(searchParams.from),
    to: firstSearchValue(searchParams.to),
    cursor: firstSearchValue(searchParams.cursor),
  };
}

function appendFilter(params: URLSearchParams, input: AdminInvoiceListInput, includeCursor: boolean) {
  const invoiceNumber = input.invoiceNumber?.trim();
  const supplierId = input.supplierId?.trim();
  const from = input.from?.trim();
  const to = input.to?.trim();
  const cursor = input.cursor?.trim();
  if (invoiceNumber) params.set('q', invoiceNumber);
  if (supplierId) params.set('supplier', supplierId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (includeCursor && cursor) params.set('cursor', cursor);
}

/** List URL, including the current search. A new search omits the page cursor. */
export function adminInvoiceListHref(input: AdminInvoiceListInput, includeCursor = true): string {
  const params = new URLSearchParams();
  appendFilter(params, input, includeCursor);
  const query = params.toString();
  return query ? `/admin/invoices?${query}` : '/admin/invoices';
}

/** Detail URL that keeps the list search for the way back. */
export function adminInvoiceDetailHref(id: string, input: AdminInvoiceListInput): string {
  const params = new URLSearchParams();
  appendFilter(params, input, false);
  const query = params.toString();
  const path = `/admin/invoices/${encodeURIComponent(id)}`;
  return query ? `${path}?${query}` : path;
}

/**
 * Invoice-number search uses the same normalizers as supplier invoice identity:
 * `canonicalInvoiceNumber` for `invoiceKey`, then `compactInvoiceNumber` for
 * `invoiceKeyCompact`. Matches are equality, so Postgres can use
 * `@@index([supplierId, invoiceKeyCompact])` and the unique
 * `(supplierId, invoiceKey, invoiceDateKey)` prefix when a supplier is chosen.
 * Confirmed alternate spellings match `SupplierInvoiceKeyAlias.invoiceKey`.
 */
export function buildAdminInvoiceListQuery(input: AdminInvoiceListInput): AdminInvoiceListQuery {
  const supplierId = (input.supplierId ?? '').trim();
  if (supplierId && !isAdminInvoiceRecordId(supplierId)) {
    return { ok: false, error: 'Choose a supplier from the list.' };
  }

  const cursor = (input.cursor ?? '').trim();
  if (cursor && !isAdminInvoiceRecordId(cursor)) {
    return { ok: false, error: 'That page link is not valid. Start again from the first page.' };
  }

  const fromRaw = (input.from ?? '').trim();
  const toRaw = (input.to ?? '').trim();
  const from = fromRaw ? canonicalInvoiceDate(fromRaw) : null;
  const to = toRaw ? canonicalInvoiceDate(toRaw) : null;
  if (fromRaw && !from) {
    return { ok: false, error: 'The start date must be a real calendar date, written year-first.' };
  }
  if (toRaw && !to) {
    return { ok: false, error: 'The end date must be a real calendar date, written year-first.' };
  }
  if (from && to && from > to) {
    return { ok: false, error: 'The start date is after the end date.' };
  }

  const numberRaw = (input.invoiceNumber ?? '').trim();
  if (numberRaw.length > 128) {
    return { ok: false, error: 'Invoice numbers are limited to 128 characters.' };
  }

  let normalized = blankKey();
  let numberWhere: Prisma.SupplierInvoiceDocumentWhereInput | null = null;
  if (numberRaw) {
    const invoiceKey = canonicalInvoiceNumber(numberRaw);
    if (!invoiceKey) {
      return {
        ok: true,
        skipQuery: true,
        notice: 'That text is not an invoice number. Unread, unknown, and n/a are not searched.',
        normalized: blankKey(),
      };
    }
    const invoiceKeyCompact = compactInvoiceNumber(invoiceKey);
    normalized = { invoiceKey, invoiceKeyCompact };
    const supplier = supplierId ? { supplierId } : {};
    numberWhere = {
      OR: [
        { ...supplier, invoiceKey },
        { ...supplier, invoiceKeyCompact },
        { ...supplier, keyAliases: { some: { invoiceKey } } },
      ],
    };
  }

  const and: Prisma.SupplierInvoiceDocumentWhereInput[] = [];
  if (supplierId && !numberWhere) and.push({ supplierId });
  if (numberWhere) and.push(numberWhere);
  if (from || to) {
    const range = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
    and.push({
      OR: [{ invoiceDateKey: range }, { dateLinks: { some: { dateKey: range } } }],
    });
  }

  const where: Prisma.SupplierInvoiceDocumentWhereInput =
    and.length === 0 ? {} : and.length === 1 ? and[0]! : { AND: and };

  return {
    ok: true,
    skipQuery: false,
    notice: null,
    normalized,
    lookup: {
      where,
      orderBy: LIST_ORDER,
      take: ADMIN_INVOICE_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    },
  };
}

export interface AdminInvoiceLineRecord {
  id: string;
  printedKey: string;
  occurrence: number;
  ordinal: number;
  heldByLegacy: boolean;
}

export interface AdminInvoiceDeliveryRecord {
  id: string;
  itemName: string;
  productName: string;
  casesReceived: number;
  caseCost: number;
  packSize: number;
  unitsAdded: number;
  createdAt: Date;
  transactionId: string | null;
}

export interface AdminInvoiceJoinedLine {
  line: AdminInvoiceLineRecord;
  /** Present when a receiving delivery was posted with this line's id. */
  delivery: AdminInvoiceDeliveryRecord | null;
}

export interface AdminInvoiceListItem {
  id: string;
  invoiceNumber: string;
  invoiceKey: string;
  invoiceDate: string | null;
  invoiceDateKey: string | null;
  supplierId: string;
  supplierName: string;
  createdAt: string;
  lineCount: number;
}

export interface AdminInvoiceDetail {
  id: string;
  invoiceNumber: string;
  invoiceKey: string;
  invoiceDate: string | null;
  invoiceDateKey: string | null;
  supplierId: string;
  supplierName: string;
  createdAt: string;
  lines: AdminInvoiceJoinedLine[];
}

/**
 * Join received lines to deliveries on the shared id.
 * `SupplierInvoiceLine.id` is the delivery id assigned in supplier invoice identity
 * (`deliveryId: line.id`) and posted as `externalLogId` on the receiving delivery.
 */
export function joinInvoiceLinesToDeliveries(
  lines: readonly AdminInvoiceLineRecord[],
  deliveries: readonly AdminInvoiceDeliveryRecord[]
): AdminInvoiceJoinedLine[] {
  const byId = new Map<string, AdminInvoiceDeliveryRecord>();
  for (const delivery of deliveries) {
    if (!byId.has(delivery.id)) byId.set(delivery.id, delivery);
  }
  return [...lines]
    .sort(
      (left, right) =>
        left.ordinal - right.ordinal ||
        left.occurrence - right.occurrence ||
        left.id.localeCompare(right.id)
    )
    .map((line) => ({
      line,
      delivery: byId.get(line.id) ?? null,
    }));
}
