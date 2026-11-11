import { prisma } from '@/lib/db/prisma';

export interface PurchaseOrderEmailDraft {
  supplierId: string | null;
  supplierName: string;
  toEmail: string;
  fromEmail: string;
  replyTo: string | null;
  subject: string;
  body: string;
  lineKey: string;
  actorId: string | null;
}

export type PurchaseOrderEmailClaim =
  | { ok: true; id: string }
  | { ok: false; id: string; status: 'PENDING' | 'SENT' };

function pendingData(draft: PurchaseOrderEmailDraft) {
  return {
    supplierId: draft.supplierId,
    supplierName: draft.supplierName,
    toEmail: draft.toEmail,
    fromEmail: draft.fromEmail,
    replyTo: draft.replyTo,
    subject: draft.subject,
    body: draft.body,
    lineKey: draft.lineKey,
    actorId: draft.actorId,
    status: 'PENDING' as const,
    providerId: null,
    error: null,
  };
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

async function findLine(supplierId: string | null, lineKey: string) {
  return prisma.purchaseOrderEmail.findFirst({
    where: { supplierId, lineKey },
    select: { id: true, status: true },
  });
}

/** Insert PENDING for this supplier and line key. A SENT or PENDING row blocks another claim. */
export async function claimPurchaseOrderEmail(
  draft: PurchaseOrderEmailDraft
): Promise<PurchaseOrderEmailClaim> {
  try {
    const row = await prisma.purchaseOrderEmail.create({
      data: pendingData(draft),
      select: { id: true },
    });
    return { ok: true, id: row.id };
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
  }

  const existing = await findLine(draft.supplierId, draft.lineKey);
  if (!existing) {
    throw new Error('Purchase order email claim conflicted, but no row was found.');
  }
  if (existing.status === 'PENDING' || existing.status === 'SENT') {
    return { ok: false, id: existing.id, status: existing.status };
  }

  const reclaimed = await prisma.purchaseOrderEmail.updateMany({
    where: { id: existing.id, status: 'FAILED' },
    data: pendingData(draft),
  });
  if (reclaimed.count === 1) return { ok: true, id: existing.id };

  const again = await findLine(draft.supplierId, draft.lineKey);
  if (again && (again.status === 'PENDING' || again.status === 'SENT')) {
    return { ok: false, id: again.id, status: again.status };
  }
  throw new Error('Purchase order email could not be claimed.');
}

export async function markPurchaseOrderEmailSent(id: string, providerId: string | null): Promise<void> {
  await prisma.purchaseOrderEmail.update({
    where: { id },
    data: { status: 'SENT', providerId, error: null },
  });
}

export async function markPurchaseOrderEmailFailed(id: string, error: string): Promise<void> {
  await prisma.purchaseOrderEmail.update({
    where: { id },
    data: { status: 'FAILED', error: error.slice(0, 500) },
  });
}
