import { prisma } from '@/lib/db/prisma';
import {
  coveredApprovedOrderIds,
  dedupePurchaseOrderLines,
  planPurchaseOrderSubmit,
  PURCHASE_ORDER_HISTORY_LIMIT,
  purchaseOrderRecipientBlock,
  type DurablePurchaseOrderStatus,
  type PurchaseOrderHistoryEntry,
  type PurchaseOrderLineRecord,
  type StoredPurchaseOrderStatus,
} from '@/lib/domains/orders/purchaseOrderSubmit';
import type { Prisma } from '@prisma/client';

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
      closedIds: string[];
    }
  | { ok: false; error: string };

const lineSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  productIds: true,
  toEmail: true,
} as const;

type LineRow = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  status: StoredPurchaseOrderStatus;
  productIds: string[];
  toEmail: string;
};

type OrderTx = Pick<Prisma.TransactionClient, 'purchaseOrderEmail'>;

function requiredSupplierId(supplierId: string): string {
  const id = typeof supplierId === 'string' ? supplierId.trim() : '';
  if (!id) throw new Error('supplierId is required.');
  return id;
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

function findLine(db: OrderTx, supplierId: string, lineKey: string) {
  return db.purchaseOrderEmail.findFirst({
    where: { supplierId, lineKey },
    select: lineSelect,
  });
}

/** Insert unless this supplier and lineKey already exist. A conflict does not throw. */
async function insertLine(db: OrderTx, data: Prisma.PurchaseOrderEmailCreateManyInput): Promise<boolean> {
  const created = await db.purchaseOrderEmail.createMany({
    data: [data],
    skipDuplicates: true,
  });
  return created.count === 1;
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
    const inserted = await insertLine(prisma, data);
    if (inserted) {
      const row = await findLine(prisma, supplierId, draft.lineKey);
      if (!row) throw new Error('Purchase order could not be saved.');
      return { ok: true, id: row.id, openedAt: row.createdAt.toISOString() };
    }
  }

  const existing = await findLine(prisma, supplierId, draft.lineKey);
  if (!existing) {
    await insertLine(prisma, data);
    const row = await findLine(prisma, supplierId, draft.lineKey);
    if (!row) throw new Error('Purchase order could not be saved.');
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
  duplicate: boolean,
  closedIds: string[]
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
    closedIds,
  };
}

async function closeCoveredApproved(
  db: OrderTx,
  supplierId: string,
  sentProductIds: readonly string[],
  keepId: string
): Promise<string[]> {
  const approved = await db.purchaseOrderEmail.findMany({
    where: { supplierId, status: 'APPROVED' },
    select: { id: true, status: true, productIds: true },
  });
  const ids = coveredApprovedOrderIds(approved, sentProductIds).filter((id) => id !== keepId);
  if (ids.length === 0) return [];
  await db.purchaseOrderEmail.updateMany({
    where: { id: { in: ids }, status: 'APPROVED' },
    data: { status: 'SENT' },
  });
  return ids;
}

async function writePurchaseOrder(
  db: OrderTx,
  draft: PurchaseOrderSubmitDraft,
  supplierId: string,
  existing: LineRow | null
): Promise<PurchaseOrderSubmitResult> {
  const plan = planPurchaseOrderSubmit({
    requested: draft.status,
    toEmail: draft.toEmail,
    productIds: draft.productIds,
    existing: existing ? asLineRecord(existing) : null,
  });
  if (!plan.ok) return plan;

  if (!existing) {
    const inserted = await insertLine(db, {
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
    });
    const row = await findLine(db, supplierId, draft.lineKey);
    if (!row) throw new Error('Purchase order could not be saved.');
    if (!inserted) return writePurchaseOrder(db, draft, supplierId, row);
    return savedResult(row, draft.lineKey, false, []);
  }

  const statusChanged = plan.decision.status !== null && plan.decision.status !== existing.status;
  const linesChanged = existing.productIds.join('\n') !== plan.decision.productIds.join('\n');
  const emailChanged = plan.decision.status === 'SENT' && existing.toEmail !== plan.decision.toEmail;
  if (!statusChanged && !linesChanged && !emailChanged) {
    return savedResult(existing, draft.lineKey, true, []);
  }

  await db.purchaseOrderEmail.updateMany({
    where: { id: existing.id, status: { not: 'SENT' } },
    data: {
      ...(statusChanged && plan.decision.status ? { status: plan.decision.status } : {}),
      ...(linesChanged ? { productIds: plan.decision.productIds } : {}),
      ...(emailChanged ? { toEmail: plan.decision.toEmail } : {}),
    },
  });
  const row = await db.purchaseOrderEmail.findUnique({
    where: { id: existing.id },
    select: lineSelect,
  });
  if (!row) throw new Error('Purchase order could not be saved.');
  return savedResult(row, draft.lineKey, true, []);
}

/** Save Approved or Sent for this supplier and lineKey. A repeat call updates that row. */
export async function submitPurchaseOrder(
  draft: PurchaseOrderSubmitDraft
): Promise<PurchaseOrderSubmitResult> {
  const supplierId = requiredSupplierId(draft.supplierId);
  const blocked = purchaseOrderRecipientBlock(draft.toEmail);
  if (blocked) return { ok: false, error: blocked };

  return prisma.$transaction(async (tx) => {
    const existing = await findLine(tx, supplierId, draft.lineKey);
    const written = await writePurchaseOrder(tx, draft, supplierId, existing);
    if (!written.ok || written.status !== 'SENT') return written;
    const closedIds = await closeCoveredApproved(tx, supplierId, written.productIds, written.id);
    return { ...written, closedIds };
  });
}

/** Newest purchase orders for one supplier, by the same timestamp used for open marks. */
export async function listPurchaseOrders(supplierId: string): Promise<PurchaseOrderHistoryEntry[]> {
  const rows = await prisma.purchaseOrderEmail.findMany({
    where: { supplierId },
    orderBy: [{ updatedAt: 'desc' }],
    take: PURCHASE_ORDER_HISTORY_LIMIT,
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
