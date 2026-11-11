import { prisma } from '@/lib/db/prisma';

export interface PurchaseOrderEmailDraft {
  /** Required. A null id would not collide in the unique index, so the double-send guard would not hold. */
  supplierId: string;
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

function requiredSupplierId(supplierId: string): string {
  const id = typeof supplierId === 'string' ? supplierId.trim() : '';
  if (!id) throw new Error('supplierId is required.');
  return id;
}

async function findLine(supplierId: string, lineKey: string) {
  return prisma.purchaseOrderEmail.findFirst({
    where: { supplierId, lineKey },
    select: { id: true, status: true },
  });
}

/** Insert PENDING for this supplier and line key. A SENT or PENDING row blocks another claim. */
export async function claimPurchaseOrderEmail(
  draft: PurchaseOrderEmailDraft
): Promise<PurchaseOrderEmailClaim> {
  const supplierId = requiredSupplierId(draft.supplierId);
  const claimed = { ...draft, supplierId };
  try {
    const row = await prisma.purchaseOrderEmail.create({
      data: pendingData(claimed),
      select: { id: true },
    });
    return { ok: true, id: row.id };
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
  }

  const existing = await findLine(supplierId, claimed.lineKey);
  if (!existing) {
    throw new Error('Purchase order email claim conflicted, but no row was found.');
  }
  // A stale PENDING row blocks a resend until it is reset.
  if (existing.status === 'PENDING' || existing.status === 'SENT') {
    return { ok: false, id: existing.id, status: existing.status };
  }

  const reclaimed = await prisma.purchaseOrderEmail.updateMany({
    where: { id: existing.id, status: 'FAILED' },
    data: pendingData(claimed),
  });
  if (reclaimed.count === 1) return { ok: true, id: existing.id };

  const again = await findLine(supplierId, claimed.lineKey);
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
