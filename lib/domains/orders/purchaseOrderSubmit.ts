import { z } from 'zod';
import { singleSupplierEmail } from '@/components/features/orders/supplierMail';

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
