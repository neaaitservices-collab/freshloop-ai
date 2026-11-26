import { prisma } from '@/lib/db/prisma';
import {
  dedupePurchaseOrderLines,
  planPurchaseOrderSubmit,
  purchaseOrderRecipientBlock,
  type DurablePurchaseOrderStatus,
  type PurchaseOrderHistoryEntry,
  type PurchaseOrderLineRecord,
  type StoredPurchaseOrderStatus,
} from '@/lib/domains/orders/purchaseOrderSubmit';

export interface PurchaseOrderOpenDraft {
  /** Required. A null id would not collide in the unique index, so a repeat open would not be detected. */
  supplierId: string;
  supplierName: string;
  toEmail: string;
  subject: string;
  body: string;
  lineKey: string;
  actorId: string | null;
  productIds?: readonly string[];
}

export type PurchaseOrderOpenResult =
  | { ok: true; id: string; openedAt: string }
  | { ok: false; id: string; openedAt: string };

export interface PurchaseOrderSubmitDraft {
  supplierId: string;
  supplierName: string;
  toEmail: string;
  subject: string;
  body: string;
  lineKey: string;
  productIds: readonly string[];
  actorId: string | null;
  status: DurablePurchaseOrderStatus;
}

export type PurchaseOrderSubmitResult =
  | {
      ok: true;
      id: string;
      status: StoredPurchaseOrderStatus;
      openedAt: string;
      updatedAt: string;
      duplicate: boolean;
      productIds: string[];
      lineKey: string;
    }
  | { ok: false; error: string };

function requiredSupplierId(supplierId: string): string {
  const id = typeof supplierId === 'string' ? supplierId.trim() : '';
  if (!id) throw new Error('supplierId is required.');
  return id;
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function openData(draft: PurchaseOrderOpenDraft, supplierId: string) {
  return {
    supplierId,
    supplierName: draft.supplierName,
    toEmail: draft.toEmail,
    fromEmail: '',
    replyTo: null,
    subject: draft.subject,
    body: draft.body,
    lineKey: draft.lineKey,
    productIds: dedupePurchaseOrderLines(draft.productIds ?? []),
    actorId: draft.actorId,
    status: 'OPENED' as const,
    providerId: null,
    error: null,
  };
}

async function findLine(supplierId: string, lineKey: string) {
  return prisma.purchaseOrderEmail.findFirst({
    where: { supplierId, lineKey },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      productIds: true,
      toEmail: true,
    },
  });
}

function asLineRecord(row: NonNullable<Awaited<ReturnType<typeof findLine>>>): PurchaseOrderLineRecord {
  return {
    id: row.id,
    status: row.status,
    productIds: row.productIds,
    toEmail: row.toEmail,
  };
}

/** Record that this supplier's order was opened. An existing row blocks another open until the caller confirms. */
export async function recordPurchaseOrderOpen(
  draft: PurchaseOrderOpenDraft,
  reopen: boolean
): Promise<PurchaseOrderOpenResult> {
  const supplierId = requiredSupplierId(draft.supplierId);
  const data = openData(draft, supplierId);

  if (!reopen) {
    try {
      const row = await prisma.purchaseOrderEmail.create({
        data,
        select: { id: true, createdAt: true },
      });
      return { ok: true, id: row.id, openedAt: row.createdAt.toISOString() };
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }
  }

  const existing = await findLine(supplierId, draft.lineKey);
  if (!existing) {
    const row = await prisma.purchaseOrderEmail.create({
      data,
      select: { id: true, createdAt: true },
    });
    return { ok: true, id: row.id, openedAt: row.createdAt.toISOString() };
  }
  // Approved is saved, not mailed. The first mailto is still the first open.
  if (!reopen && existing.status !== 'APPROVED') {
    return { ok: false, id: existing.id, openedAt: existing.createdAt.toISOString() };
  }
  return { ok: true, id: existing.id, openedAt: existing.createdAt.toISOString() };
}

function savedResult(
  row: {
    id: string;
    status: StoredPurchaseOrderStatus;
    createdAt: Date;
    updatedAt: Date;
    productIds: string[];
  },
  lineKey: string,
  duplicate: boolean
): PurchaseOrderSubmitResult {
  return {
    ok: true,
    id: row.id,
    status: row.status,
    openedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    duplicate,
    productIds: row.productIds,
    lineKey,
  };
}

async function writePurchaseOrder(
  draft: PurchaseOrderSubmitDraft,
  supplierId: string,
  existing: NonNullable<Awaited<ReturnType<typeof findLine>>> | null
): Promise<PurchaseOrderSubmitResult> {
  const plan = planPurchaseOrderSubmit({
    requested: draft.status,
    toEmail: draft.toEmail,
    productIds: draft.productIds,
    existing: existing ? asLineRecord(existing) : null,
  });
  if (!plan.ok) return plan;

  if (!existing) {
    try {
      const row = await prisma.purchaseOrderEmail.create({
        data: {
          supplierId,
          supplierName: draft.supplierName,
          toEmail: plan.decision.toEmail,
          fromEmail: '',
          replyTo: null,
          subject: draft.subject,
          body: draft.body,
          lineKey: draft.lineKey,
          productIds: plan.decision.productIds,
          actorId: draft.actorId,
          status: plan.decision.status ?? draft.status,
          providerId: null,
          error: null,
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          productIds: true,
        },
      });
      return savedResult(row, draft.lineKey, false);
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const raced = await findLine(supplierId, draft.lineKey);
      if (!raced) throw error;
      return writePurchaseOrder(draft, supplierId, raced);
    }
  }

  const statusChanged = plan.decision.status !== null && plan.decision.status !== existing.status;
  const linesChanged = existing.productIds.join('\n') !== plan.decision.productIds.join('\n');
  const emailChanged = plan.decision.status === 'SENT' && existing.toEmail !== plan.decision.toEmail;
  if (!statusChanged && !linesChanged && !emailChanged) {
    return savedResult(existing, draft.lineKey, true);
  }

  const row = await prisma.purchaseOrderEmail.update({
    where: { id: existing.id },
    data: {
      ...(statusChanged && plan.decision.status ? { status: plan.decision.status } : {}),
      ...(linesChanged ? { productIds: plan.decision.productIds } : {}),
      ...(emailChanged ? { toEmail: plan.decision.toEmail } : {}),
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      productIds: true,
    },
  });
  return savedResult(row, draft.lineKey, true);
}

/** Save Approved or Sent for this supplier and lineKey. A repeat call updates that row. */
export async function submitPurchaseOrder(
  draft: PurchaseOrderSubmitDraft
): Promise<PurchaseOrderSubmitResult> {
  const supplierId = requiredSupplierId(draft.supplierId);
  const blocked = purchaseOrderRecipientBlock(draft.toEmail);
  if (blocked) return { ok: false, error: blocked };
  const existing = await findLine(supplierId, draft.lineKey);
  return writePurchaseOrder(draft, supplierId, existing);
}

/** Newest purchase orders first. Pass a supplier id to limit the list to that supplier. */
export async function listPurchaseOrders(supplierId: string | null): Promise<PurchaseOrderHistoryEntry[]> {
  const rows = await prisma.purchaseOrderEmail.findMany({
    where: supplierId ? { supplierId } : undefined,
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      supplierId: true,
      supplierName: true,
      toEmail: true,
      subject: true,
      status: true,
      lineKey: true,
      productIds: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    toEmail: row.toEmail,
    subject: row.subject,
    status: row.status,
    lineKey: row.lineKey,
    productIds: row.productIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}
