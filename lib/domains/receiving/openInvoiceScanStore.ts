import { prisma } from '@/lib/domains/inventory/ledger';
import {
  invoiceResultFromStoredDraft,
  pickOpenInvoiceScan,
} from '@/lib/domains/receiving/openInvoiceScan';
import type { InvoiceOcrResult } from '@/lib/types';

/** Open scan for this clerk, or null when the table cannot be read. */
export async function loadOpenInvoiceScan(
  staffId: string,
  now = new Date()
): Promise<InvoiceOcrResult | null> {
  try {
    const rows = await prisma.invoiceOcrDraft.findMany({
      where: { staffId, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      take: 8,
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

/**
 * Drop an unposted scan so a refresh does not bring it back.
 * A draft already posted to inventory is left in place.
 */
export async function discardOpenInvoiceScan(staffId: string, draftId: string): Promise<boolean> {
  const id = draftId.trim();
  if (!id) return false;
  const row = await prisma.invoiceOcrDraft.findFirst({
    where: { id, staffId },
    select: { id: true, consumedAt: true },
  });
  if (!row) return false;
  if (row.consumedAt) return true;
  await prisma.invoiceOcrDraft.delete({ where: { id: row.id } });
  return true;
}
