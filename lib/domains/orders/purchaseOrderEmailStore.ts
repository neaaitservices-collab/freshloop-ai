import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { PURCHASE_ORDER_OPEN_WINDOW_MS, purchaseOrderCycleIsOpen } from '@/components/features/orders/supplierMail';
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
  cycleKey: true,
} as const;

type LineRow = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  status: StoredPurchaseOrderStatus;
  productIds: string[];
  toEmail: string;
  cycleKey: string;
};

type OrderTx = Prisma.TransactionClient;

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

async function lockLine(db: OrderTx, supplierId: string, lineKey: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${supplierId}), hashtext(${lineKey}))`;
}

async function latestReceipts(
  db: OrderTx,
  productIds: readonly string[]
): Promise<Record<string, Date | null>> {
  const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
  const receipts: Record<string, Date | null> = {};
  if (ids.length === 0) return receipts;
  const groups = await db.inventoryTransaction.groupBy({
    by: ['productId'],
    where: { productId: { in: ids }, transactionType: 'Receive' },
    _max: { timestamp: true },
  });
  for (const group of groups) receipts[group.productId] = group._max.timestamp;
  return receipts;
}

async function findOpenCycle(
  db: OrderTx,
  supplierId: string,
  lineKey: string,
  productIds: readonly string[],
  now: Date
): Promise<LineRow | null> {
  const rows = await db.purchaseOrderEmail.findMany({
    where: { supplierId, lineKey },
    orderBy: { updatedAt: 'desc' },
    select: lineSelect,
  });
  const receipts = await latestReceipts(db, [
    ...productIds,
    ...rows.flatMap((row) => row.productIds),
  ]);
  return (
    rows.find((row) =>
      purchaseOrderCycleIsOpen({
        updatedAt: row.updatedAt,
        productIds: row.productIds.length > 0 ? row.productIds : productIds,
        now,
        lastReceiptAt: receipts,
      })
    ) ?? null
  );
}

/** The open cycle for this supplier and line key, using the server clock. */
export async function findOpenPurchaseOrder(
  supplierId: string,
  lineKey: string,
  productIds: readonly string[]
): Promise<{ id: string; createdAt: Date; status: StoredPurchaseOrderStatus } | null> {
  const open = await findOpenCycle(prisma, supplierId, lineKey, productIds, new Date());
  if (!open) return null;
  return { id: open.id, createdAt: open.createdAt, status: open.status };
}

/** Insert unless this supplier and lineKey already exist. A conflict does not throw. */
async function insertLine(db: OrderTx, data: Prisma.PurchaseOrderEmailCreateManyInput): Promise<boolean> {
  const created = await db.purchaseOrderEmail.createMany({
    data: [data],
    skipDuplicates: true,
  });
  return created.count === 1;
}

function asLineRecord(row: LineRow): PurchaseOrderLineRecord {
  return {
    id: row.id,
    status: row.status,
    productIds: row.productIds,
    toEmail: row.toEmail,
  };
}

async function insertCycle(
  db: OrderTx,
  data: Prisma.PurchaseOrderEmailCreateManyInput
): Promise<LineRow> {
  const cycleKey = typeof data.cycleKey === 'string' ? data.cycleKey : randomUUID();
  await insertLine(db, { ...data, cycleKey });
  const row = await db.purchaseOrderEmail.findFirst({
    where: { supplierId: data.supplierId, lineKey: data.lineKey, cycleKey },
    select: lineSelect,
  });
  if (!row) throw new Error('Purchase order could not be saved.');
  return row;
}

/** Record that this supplier's order was opened. A closed cycle does not block the next one. */
export async function recordPurchaseOrderOpen(
  draft: PurchaseOrderOpenDraft,
  reopen: boolean
): Promise<PurchaseOrderOpenResult> {
  const supplierId = requiredSupplierId(draft.supplierId);
  const data = openData(draft, supplierId);
  return prisma.$transaction(async (tx) => {
    await lockLine(tx, supplierId, draft.lineKey);
    const now = new Date();
    const existing = await findOpenCycle(tx, supplierId, draft.lineKey, data.productIds, now);
    if (!existing) {
      const row = await insertCycle(tx, data);
      return { ok: true, id: row.id, openedAt: row.createdAt.toISOString() };
    }
    // Approved is saved, not mailed. The first mailto of this cycle is still the first open.
    if (!reopen && existing.status !== 'APPROVED') {
      return { ok: false, id: existing.id, openedAt: existing.createdAt.toISOString() };
    }
    return { ok: true, id: existing.id, openedAt: existing.createdAt.toISOString() };
  });
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
  keepId: string,
  now: Date
): Promise<string[]> {
  const windowStart = new Date(now.getTime() - PURCHASE_ORDER_OPEN_WINDOW_MS);
  const approved = await db.purchaseOrderEmail.findMany({
    where: {
      supplierId,
      status: 'APPROVED',
      updatedAt: { gte: windowStart },
      id: { not: keepId },
    },
    select: { id: true, status: true, productIds: true, updatedAt: true },
  });
  const receipts = await latestReceipts(
    db,
    approved.flatMap((row) => row.productIds)
  );
  const stillOpen = approved.filter((row) =>
    purchaseOrderCycleIsOpen({
      updatedAt: row.updatedAt,
      productIds: row.productIds,
      now,
      lastReceiptAt: receipts,
    })
  );
  const sent = new Set(dedupePurchaseOrderLines(sentProductIds));
  const fullIds = coveredApprovedOrderIds(stillOpen, sentProductIds);
  const closedIds: string[] = [];
  if (fullIds.length > 0) {
    await db.purchaseOrderEmail.updateMany({
      where: { id: { in: fullIds }, status: 'APPROVED', updatedAt: { gte: windowStart } },
      data: { status: 'SENT' },
    });
    closedIds.push(...fullIds);
  }
  for (const row of stillOpen) {
    if (fullIds.includes(row.id)) continue;
    const lines = dedupePurchaseOrderLines(row.productIds);
    if (!lines.some((id) => sent.has(id))) continue;
    const remaining = lines.filter((id) => !sent.has(id));
    if (remaining.length === 0) continue;
    await db.purchaseOrderEmail.updateMany({
      where: { id: row.id, status: 'APPROVED', updatedAt: { gte: windowStart } },
      data: { productIds: remaining },
    });
  }
  return closedIds;
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
    const row = await insertCycle(db, {
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
      cycleKey: randomUUID(),
    });
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
    await lockLine(tx, supplierId, draft.lineKey);
    const now = new Date();
    const existing = await findOpenCycle(tx, supplierId, draft.lineKey, draft.productIds, now);
    const written = await writePurchaseOrder(tx, draft, supplierId, existing);
    if (!written.ok || written.status !== 'SENT') return written;
    const closedIds = await closeCoveredApproved(tx, supplierId, written.productIds, written.id, now);
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
  const now = new Date();
  const receipts = await latestReceipts(
    prisma,
    rows.flatMap((row) => row.productIds)
  );
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
    open: purchaseOrderCycleIsOpen({
      updatedAt: row.updatedAt,
      productIds: row.productIds,
      now,
      lastReceiptAt: receipts,
    }),
  }));
}
