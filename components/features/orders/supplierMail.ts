import type { StockLevel } from '@/lib/domains/inventory/stock';

export type LineMark = 'approved' | 'sent';

/** No mail transport is wired. A prepared draft must not claim the order was sent. */
export const PO_DRAFT_PREPARED_NOTICE = 'Draft prepared - not sent';

export function acknowledgePurchaseOrderDraft(): { notice: string; markSent: false } {
  return { notice: PO_DRAFT_PREPARED_NOTICE, markSent: false };
}

export interface SupplierDirectoryEntry {
  name: string;
  contactEmail?: string | null;
}

export type SupplierRecipientIssue = 'missing' | 'ambiguous';

export const MISSING_SUPPLIER_EMAIL_HINT =
  'No email saved for this supplier. Add it in Suppliers.';

export const AMBIGUOUS_SUPPLIER_EMAIL_HINT =
  'More than one supplier matches this name. Add it in Suppliers.';

export interface PoDraft {
  supplier: string;
  to: string;
  subject: string;
  body: string;
  productIds: string[];
  /** Why To was left blank. Absent when a single stored address was used. */
  recipientIssue?: SupplierRecipientIssue;
}

/** A stored contact address, or blank so the buyer types one. Never invent a domain. */
export function storedSupplierRecipient(email: string | null | undefined): string {
  return typeof email === 'string' ? email.trim() : '';
}

export function caseWord(count: number): string {
  return count === 1 ? 'case' : 'cases';
}

export function orderLine(row: StockLevel): string {
  if (row.orderCases > 0) {
    return `${row.orderCases} ${caseWord(row.orderCases)} - ${row.name}`;
  }
  return `In stock - ${row.name}`;
}

export function openOrderRows(rows: StockLevel[], marks: Record<string, LineMark>): StockLevel[] {
  return rows.filter((row) => row.low && marks[row.productId] !== 'sent');
}

export function approvedOrderRows(rows: StockLevel[], marks: Record<string, LineMark>): StockLevel[] {
  return openOrderRows(rows, marks).filter((row) => marks[row.productId] === 'approved');
}

export function draftForRows(
  supplier: string,
  rows: StockLevel[],
  storedEmail?: string | null
): PoDraft {
  const lines = rows.map(orderLine);
  return {
    supplier,
    to: storedSupplierRecipient(storedEmail),
    subject: `Supermarket Purchase Order - ${supplier}`,
    body: lines.join('\n'),
    productIds: rows.map((row) => row.productId),
  };
}

function supplierNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function rowsForSupplier(supplier: string, rows: StockLevel[]): StockLevel[] {
  const key = supplierNameKey(supplier);
  return rows.filter((row) => supplierNameKey(row.supplier) === key);
}

/** Match a buy-list supplier to directory rows by trimmed, case-insensitive name. */
export function matchSupplierRecipient(
  supplierName: string,
  directory: readonly SupplierDirectoryEntry[]
):
  | { status: 'matched'; email: string }
  | { status: 'missing' }
  | { status: 'ambiguous' } {
  const key = supplierNameKey(supplierName);
  if (!key) return { status: 'missing' };
  const matches = directory.filter((entry) => supplierNameKey(entry.name) === key);
  if (matches.length === 0) return { status: 'missing' };
  if (matches.length > 1) return { status: 'ambiguous' };
  const email = storedSupplierRecipient(matches[0]?.contactEmail);
  if (!email) return { status: 'missing' };
  return { status: 'matched', email };
}

export function supplierRecipientHint(
  draft: Pick<PoDraft, 'to' | 'recipientIssue'>
): string | null {
  if (draft.to.trim()) return null;
  if (draft.recipientIssue === 'ambiguous') return AMBIGUOUS_SUPPLIER_EMAIL_HINT;
  return MISSING_SUPPLIER_EMAIL_HINT;
}

/** One supplier, one draft. To is that supplier's stored address, or blank. */
export function draftForSupplier(
  supplier: string,
  rows: StockLevel[],
  directory: readonly SupplierDirectoryEntry[]
): PoDraft {
  const ownRows = rowsForSupplier(supplier, rows);
  const match = matchSupplierRecipient(supplier, directory);
  if (match.status === 'matched') return draftForRows(supplier, ownRows, match.email);
  return {
    ...draftForRows(supplier, ownRows, null),
    to: '',
    recipientIssue: match.status,
  };
}

/** One draft per supplier. Never joins recipients or lines across suppliers. */
export function draftsForSuppliers(
  groups: ReadonlyArray<{ supplier: string; rows: StockLevel[] }>,
  directory: readonly SupplierDirectoryEntry[]
): PoDraft[] {
  return groups
    .filter((group) => rowsForSupplier(group.supplier, group.rows).length > 0)
    .map((group) => draftForSupplier(group.supplier, group.rows, directory));
}

export function groupBySupplier(levels: StockLevel[]): Record<string, StockLevel[]> {
  const grouped: Record<string, StockLevel[]> = {};
  for (const row of levels) {
    const list = grouped[row.supplier] ?? [];
    list.push(row);
    grouped[row.supplier] = list;
  }
  for (const supplier of Object.keys(grouped)) {
    grouped[supplier].sort(
      (a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name)
    );
  }
  return grouped;
}
