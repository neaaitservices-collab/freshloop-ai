import type { StockLevel } from '@/lib/domains/inventory/stock';

export type LineMark = 'approved' | 'sent';

/** No mail transport is wired. A prepared draft must not claim the order was sent. */
export const PO_DRAFT_PREPARED_NOTICE = 'Draft prepared - not sent';

export function acknowledgePurchaseOrderDraft(): { notice: string; markSent: false } {
  return { notice: PO_DRAFT_PREPARED_NOTICE, markSent: false };
}

export interface PoDraft {
  supplier: string;
  to: string;
  subject: string;
  body: string;
  productIds: string[];
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

export function draftForAll(
  groups: Array<{ supplier: string; rows: StockLevel[]; email?: string | null }>
): PoDraft {
  const blocks = groups
    .filter((group) => group.rows.length > 0)
    .map((group) => `${group.supplier}\n${group.rows.map(orderLine).join('\n')}`);
  const suppliers = groups.map((group) => group.supplier);
  const recipients = [
    ...new Set(groups.map((group) => storedSupplierRecipient(group.email)).filter((email) => email.length > 0)),
  ];
  return {
    supplier: suppliers.length === 1 ? suppliers[0] : 'all suppliers',
    to: recipients.join(', '),
    subject: 'Supermarket Purchase Order - All suppliers',
    body: blocks.join('\n\n'),
    productIds: groups.flatMap((group) => group.rows.map((row) => row.productId)),
  };
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
