import 'server-only';

import { Prisma } from '@prisma/client';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { prisma } from '@/lib/db/prisma';
import {
  ADMIN_INVOICE_PAGE_SIZE,
  buildAdminInvoiceListQuery,
  isAdminInvoiceRecordId,
  joinInvoiceLinesToDeliveries,
  type AdminInvoiceDeliveryRecord,
  type AdminInvoiceLineRecord,
  type AdminInvoiceDetail,
  type AdminInvoiceListInput,
  type AdminInvoiceListItem,
  type AdminInvoiceListLookup,
  type AdminInvoiceNormalizedKey,
} from '@/lib/domains/receiving/adminInvoiceQuery';

/**
 * Read-only admin invoice directory.
 * `requireManagerStaff` runs before any Prisma call. Those are the same roles
 * that can open Admin: ADMIN and STORE_MANAGER. Every other role throws 403.
 * Reads use the app Prisma client. Row level security stays enabled and this
 * path does not add a policy, grant anon or authenticated, or write.
 */

export type AdminInvoiceListResult =
  | { ok: false; error: string }
  | {
      ok: true;
      invoices: AdminInvoiceListItem[];
      nextCursor: string | null;
      notice: string | null;
      normalized: AdminInvoiceNormalizedKey;
    };

export type AdminInvoiceDetailResult =
  | { ok: false; error: string }
  | { ok: true; invoice: AdminInvoiceDetail | null };

interface ListRow {
  id: string;
  invoiceNumber: string;
  invoiceKey: string;
  invoiceDate: string | null;
  invoiceDateKey: string | null;
  supplierId: string;
  createdAt: Date;
  supplier: { name: string };
  _count: { lines: number };
}

interface DetailRow {
  id: string;
  invoiceNumber: string;
  invoiceKey: string;
  invoiceDate: string | null;
  invoiceDateKey: string | null;
  supplierId: string;
  createdAt: Date;
  supplier: { name: string };
  lines: AdminInvoiceLineRecord[];
}

export interface AdminInvoiceReader {
  findDocuments: (lookup: AdminInvoiceListLookup) => Promise<ListRow[]>;
  findDocument: (id: string) => Promise<DetailRow | null>;
  findDeliveries: (ids: string[]) => Promise<AdminInvoiceDeliveryRecord[]>;
}

const listSelect = {
  id: true,
  invoiceNumber: true,
  invoiceKey: true,
  invoiceDate: true,
  invoiceDateKey: true,
  supplierId: true,
  createdAt: true,
  supplier: { select: { name: true } },
  _count: { select: { lines: true } },
} as const;

const detailSelect = {
  id: true,
  invoiceNumber: true,
  invoiceKey: true,
  invoiceDate: true,
  invoiceDateKey: true,
  supplierId: true,
  createdAt: true,
  supplier: { select: { name: true } },
  lines: {
    select: {
      id: true,
      printedKey: true,
      occurrence: true,
      ordinal: true,
      heldByLegacy: true,
    },
  },
} as const;

const deliverySelect = {
  id: true,
  itemName: true,
  productName: true,
  casesReceived: true,
  caseCost: true,
  packSize: true,
  unitsAdded: true,
  createdAt: true,
  transactionId: true,
} as const;

function defaultReader(): AdminInvoiceReader {
  return {
    findDocuments(lookup) {
      return prisma.supplierInvoiceDocument.findMany({
        where: lookup.where,
        orderBy: lookup.orderBy,
        take: lookup.take,
        select: listSelect,
        ...(lookup.cursor ? { cursor: lookup.cursor, skip: lookup.skip } : {}),
      });
    },
    findDocument(id) {
      return prisma.supplierInvoiceDocument.findUnique({
        where: { id },
        select: detailSelect,
      });
    },
    findDeliveries(ids) {
      return prisma.receivingDelivery.findMany({
        where: { id: { in: ids } },
        select: deliverySelect,
      });
    },
  };
}

function isMissingRecord(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

function toListItem(row: ListRow): AdminInvoiceListItem {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceKey: row.invoiceKey,
    invoiceDate: row.invoiceDate,
    invoiceDateKey: row.invoiceDateKey,
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    createdAt: row.createdAt.toISOString(),
    lineCount: row._count.lines,
  };
}

export async function listAdminInvoices(
  input: AdminInvoiceListInput,
  reader: AdminInvoiceReader = defaultReader()
): Promise<AdminInvoiceListResult> {
  await requireManagerStaff();
  const built = buildAdminInvoiceListQuery(input);
  if (!built.ok) return built;
  if (built.skipQuery) {
    return {
      ok: true,
      invoices: [],
      nextCursor: null,
      notice: built.notice,
      normalized: built.normalized,
    };
  }

  let rows: ListRow[];
  try {
    rows = await reader.findDocuments(built.lookup);
  } catch (error) {
    if (isMissingRecord(error)) {
      return {
        ok: false,
        error: 'That page is no longer available. Start again from the first page.',
      };
    }
    throw error;
  }

  const page = rows.slice(0, ADMIN_INVOICE_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    ok: true,
    invoices: page.map(toListItem),
    nextCursor: rows.length > ADMIN_INVOICE_PAGE_SIZE && last ? last.id : null,
    notice: null,
    normalized: built.normalized,
  };
}

export async function getAdminInvoiceDetail(
  id: string,
  reader: AdminInvoiceReader = defaultReader()
): Promise<AdminInvoiceDetailResult> {
  await requireManagerStaff();
  const documentId = id.trim();
  if (!isAdminInvoiceRecordId(documentId)) {
    return { ok: false, error: 'That invoice link is not valid.' };
  }

  const document = await reader.findDocument(documentId);
  if (!document) return { ok: true, invoice: null };

  const deliveries =
    document.lines.length > 0
      ? await reader.findDeliveries(document.lines.map((line) => line.id))
      : [];

  return {
    ok: true,
    invoice: {
      id: document.id,
      invoiceNumber: document.invoiceNumber,
      invoiceKey: document.invoiceKey,
      invoiceDate: document.invoiceDate,
      invoiceDateKey: document.invoiceDateKey,
      supplierId: document.supplierId,
      supplierName: document.supplier.name,
      createdAt: document.createdAt.toISOString(),
      lines: joinInvoiceLinesToDeliveries(document.lines, deliveries),
    },
  };
}
