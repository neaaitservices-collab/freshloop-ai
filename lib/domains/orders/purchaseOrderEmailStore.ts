import { prisma } from '@/lib/db/prisma';

export interface PurchaseOrderOpenDraft {
  /** Required. A null id would not collide in the unique index, so a repeat open would not be detected. */
  supplierId: string;
  supplierName: string;
  toEmail: string;
  subject: string;
  body: string;
  lineKey: string;
  actorId: string | null;
}

export type PurchaseOrderOpenResult =
  | { ok: true; id: string; openedAt: string }
  | { ok: false; id: string; openedAt: string };

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
    actorId: draft.actorId,
    status: 'OPENED' as const,
    providerId: null,
    error: null,
  };
}

async function findLine(supplierId: string, lineKey: string) {
  return prisma.purchaseOrderEmail.findFirst({
    where: { supplierId, lineKey },
    select: { id: true, createdAt: true },
  });
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
  if (!reopen) {
    return { ok: false, id: existing.id, openedAt: existing.createdAt.toISOString() };
  }
  return { ok: true, id: existing.id, openedAt: existing.createdAt.toISOString() };
}
