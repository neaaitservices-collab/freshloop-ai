import { prisma } from '@/lib/domains/inventory/ledger';
import {
  invoiceResultFromStoredDraft,
  pickOpenInvoiceScan,
  type RestoredInvoiceScan,
} from '@/lib/domains/receiving/openInvoiceScan';

/** Open scan for this clerk, or null when the table cannot be read. */
export async function loadOpenInvoiceScan(
  staffId: string,
  now = new Date()
): Promise<RestoredInvoiceScan | null> {
  try {
    const rows = await prisma.invoiceOcrDraft.findMany({
      where: { staffId, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: {
        id: true,
        staffId: true,
        payload: true,
        expiresAt: true,
        consumedAt: true,
        createdAt: true,
      },
    });
    const row = pickOpenInvoiceScan(rows, staffId, now);
    return row ? invoiceResultFromStoredDraft(row) : null;
  } catch (error) {
    console.error('[loadOpenInvoiceScan]', error);
    return null;
  }
}

export type DiscardOpenScanResult = { ok: true } | { ok: false; status: 404 | 409 };

/**
 * Close a scan without deleting it, so posted line records stay on the row.
 * Older open drafts for this clerk are closed in the same step and cannot return.
 */
export async function discardOpenInvoiceScan(
  staffId: string,
  draftId: string,
  now = new Date()
): Promise<DiscardOpenScanResult> {
  const id = draftId.trim();
  if (!id) return { ok: false, status: 404 };
  const marked = await prisma.invoiceOcrDraft.updateMany({
    where: { id, staffId, consumedAt: null },
    data: { consumedAt: now },
  });
  if (marked.count === 0) {
    const existing = await prisma.invoiceOcrDraft.findFirst({
      where: { id, staffId },
      select: { id: true },
    });
    return existing ? { ok: false, status: 409 } : { ok: false, status: 404 };
  }
  const target = await prisma.invoiceOcrDraft.findFirst({
    where: { id, staffId },
    select: { createdAt: true },
  });
  if (target) {
    await prisma.invoiceOcrDraft.updateMany({
      where: {
        staffId,
        consumedAt: null,
        expiresAt: { gt: now },
        createdAt: { lt: target.createdAt },
      },
      data: { consumedAt: now },
    });
  }
  return { ok: true };
}
