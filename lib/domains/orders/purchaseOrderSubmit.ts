import { z } from 'zod';
import { purchaseOrderLineKey, singleSupplierEmail } from '@/components/features/orders/supplierMail';

export const purchaseOrderStatusSchema = z.enum(['PENDING', 'SENT', 'FAILED', 'OPENED', 'APPROVED']);

export const purchaseOrderHistoryEntrySchema = z.object({
  id: z.string(),
  supplierId: z.string().nullable(),
  supplierName: z.string(),
  toEmail: z.string(),
  subject: z.string(),
  status: purchaseOrderStatusSchema,
  lineKey: z.string(),
  productIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Server clock. True while this cycle is still inside the open window and newer than receipts. */
  open: z.boolean(),
});

export const purchaseOrderHistoryResponseSchema = z.object({
  success: z.boolean(),
  orders: z.array(purchaseOrderHistoryEntrySchema).optional(),
  error: z.string().optional(),
});

export const purchaseOrderSaveResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  id: z.string().optional(),
  status: purchaseOrderStatusSchema.optional(),
  openedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  duplicate: z.boolean().optional(),
  productIds: z.array(z.string()).optional(),
  lineKey: z.string().optional(),
  closedIds: z.array(z.string()).optional(),
});

export const purchaseOrderSupplierIdSchema = z.string().trim().min(1).max(128);

/** One history request can name every supplier on the buy list. */
export const purchaseOrderSupplierIdsSchema = z.array(purchaseOrderSupplierIdSchema).min(1).max(200);

/**
 * A failed history load must not replace orders already on screen.
 * Replacing them with an empty list drops Sent and Approved marks.
 */
export function applyPurchaseOrderHistoryLoad<T>(
  current: readonly T[] | null,
  loaded: { ok: true; orders: readonly T[] } | { ok: false }
): T[] {
  if (!loaded.ok) return current ? [...current] : [];
  return [...loaded.orders];
}

/** Drop sent products from an approved order and rebuild its line key. Null when nothing is trimmed. */
export function trimCoveredPurchaseOrder(input: {
  supplier: string;
  productIds: readonly string[];
  body: string;
  sentProductIds: readonly string[];
}): { productIds: string[]; body: string; lineKey: string } | null {
  const sent = new Set(dedupePurchaseOrderLines(input.sentProductIds));
  const ids = dedupePurchaseOrderLines(input.productIds);
  const bodyLines = input.body.replace(/\r\n/g, '\n').split('\n');
  const keptIds: string[] = [];
  const keptLines: string[] = [];
  ids.forEach((id, index) => {
    if (sent.has(id)) return;
    keptIds.push(id);
    const line = bodyLines[index];
    if (typeof line === 'string') keptLines.push(line);
  });
  if (keptIds.length === 0 || keptIds.length === ids.length) return null;
  const body = keptLines.join('\n');
  return {
    productIds: keptIds,
    body,
    lineKey: purchaseOrderLineKey({ supplier: input.supplier, productIds: keptIds, body }),
  };
}

export const PURCHASE_ORDER_RECIPIENT_REQUIRED = 'Enter one supplier email address.';

export type DurablePurchaseOrderStatus = 'APPROVED' | 'SENT';

export type StoredPurchaseOrderStatus = 'PENDING' | 'SENT' | 'FAILED' | 'OPENED' | 'APPROVED';

export interface PurchaseOrderHistoryEntry {
  id: string;
  supplierId: string | null;
  supplierName: string;
  toEmail: string;
  subject: string;
  status: StoredPurchaseOrderStatus;
  lineKey: string;
  productIds: string[];
  createdAt: string;
  updatedAt: string;
  open: boolean;
}

export interface PurchaseOrderLineRecord {
  id: string;
  status: StoredPurchaseOrderStatus;
  productIds: readonly string[];
  toEmail: string;
}

export interface PurchaseOrderWrite {
  toEmail: string;
  productIds: string[];
  /** Null keeps the stored status. A repeat submit must not insert another row. */
  status: DurablePurchaseOrderStatus | null;
  duplicate: boolean;
}

export type PurchaseOrderSubmitPlan =
  | { ok: false; error: string }
  | { ok: true; decision: PurchaseOrderWrite };

/** Drop blank and repeated product ids. Keeps the first occurrence. */
export function dedupePurchaseOrderLines(productIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const id of productIds) {
    const line = id.trim();
    if (!line || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines;
}

export const PURCHASE_ORDER_HISTORY_LIMIT = 50;

/** Approved rows whose every product is in the sent set. Empty line lists are not covered. */
export function coveredApprovedOrderIds(
  rows: readonly { id: string; status: string; productIds: readonly string[] }[],
  sentProductIds: readonly string[]
): string[] {
  const sent = new Set(dedupePurchaseOrderLines(sentProductIds));
  const ids: string[] = [];
  for (const row of rows) {
    if (row.status !== 'APPROVED') continue;
    const lines = dedupePurchaseOrderLines(row.productIds);
    if (lines.length === 0 || !lines.every((id) => sent.has(id))) continue;
    ids.push(row.id);
  }
  return ids;
}

export function purchaseOrderRecipientBlock(toEmail: string): string | null {
  return singleSupplierEmail(toEmail) ? null : PURCHASE_ORDER_RECIPIENT_REQUIRED;
}

function nextStatus(
  requested: DurablePurchaseOrderStatus,
  current: StoredPurchaseOrderStatus
): DurablePurchaseOrderStatus | null {
  if (current === 'SENT') return null;
  if (requested === 'SENT') return 'SENT';
  if (current === 'APPROVED' || current === 'OPENED') return null;
  return 'APPROVED';
}

/**
 * One supplier and lineKey is one purchase order.
 * A second submit keeps that row and does not append lines.
 * Sent requires a recipient. Approved does too, so the saved order can be mailed.
 * Sent is not rewritten as Approved.
 */
export function planPurchaseOrderSubmit(input: {
  requested: DurablePurchaseOrderStatus;
  toEmail: string;
  productIds: readonly string[];
  existing: PurchaseOrderLineRecord | null;
}): PurchaseOrderSubmitPlan {
  if (purchaseOrderRecipientBlock(input.toEmail)) {
    return { ok: false, error: PURCHASE_ORDER_RECIPIENT_REQUIRED };
  }
  const toEmail = singleSupplierEmail(input.toEmail);
  if (!toEmail) return { ok: false, error: PURCHASE_ORDER_RECIPIENT_REQUIRED };
  const incoming = dedupePurchaseOrderLines(input.productIds);
  if (!input.existing) {
    return {
      ok: true,
      decision: {
        toEmail,
        productIds: incoming,
        status: input.requested,
        duplicate: false,
      },
    };
  }
  const stored = dedupePurchaseOrderLines(input.existing.productIds);
  return {
    ok: true,
    decision: {
      toEmail,
      productIds: stored.length > 0 ? stored : incoming,
      status: nextStatus(input.requested, input.existing.status),
      duplicate: true,
    },
  };
}
