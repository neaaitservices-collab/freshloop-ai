import { SAMPLE_RECEIVING_LOGS } from '@/lib/domains/receiving/receivingSheet';

/** Shown by the API and the receiving screen. Not a stock movement. */
export const SAMPLE_RECEIVING_REJECTION =
  'Sample receiving data is a preview only and was not posted to inventory.';

/** Fixed id on the in-app “Use a sample invoice” fixture. */
export const DEMO_INVOICE_NUMBER = 'INV-2026-1020-TD';

export interface SampleReceivingLine {
  externalLogId?: string | null;
  invoiceNumber?: string | null;
}

const FIXTURE_IDS = new Set(
  SAMPLE_RECEIVING_LOGS.map((row) => row.id.trim().toLowerCase())
);

function reservedSampleId(externalLogId: string | null | undefined): boolean {
  const id = externalLogId?.trim().toLowerCase() ?? '';
  if (!id) return false;
  if (FIXTURE_IDS.has(id)) return true;
  return id.includes(DEMO_INVOICE_NUMBER.toLowerCase());
}

function reservedInvoiceNumber(invoiceNumber: string | null | undefined): boolean {
  return invoiceNumber?.trim().toLowerCase() === DEMO_INVOICE_NUMBER.toLowerCase();
}

/**
 * Reserved demo identities only. Name, quantity, and case cost never decide
 * this: a real sheet or OCR line may use the same commercial values, and a
 * one-cent edit would slip past a value check anyway.
 * Returns the rejection message, or null when the line may post.
 */
export function sampleReceivingRejection(line: SampleReceivingLine): string | null {
  if (reservedSampleId(line.externalLogId) || reservedInvoiceNumber(line.invoiceNumber)) {
    return SAMPLE_RECEIVING_REJECTION;
  }
  return null;
}

/** Whole-invoice identity. One matching product line is not a demo invoice. */
export function sampleInvoiceCommitRejection(input: {
  invoiceNumber?: string | null;
}): string | null {
  return sampleReceivingRejection({ invoiceNumber: input.invoiceNumber });
}

export interface StoredOcrDraftGate {
  expiresAt: Date;
  payload: { invoiceNumber?: string | null; vendorName?: string | null };
}

/**
 * Decide whether a stored OCR draft may be committed.
 * A missing draft is 404 and must not call the ledger writer.
 * The practice invoice number is 409. Line prices are not consulted.
 */
export function gateStoredOcrDraft(
  draft: StoredOcrDraftGate | null,
  now = Date.now()
): { ok: true } | { ok: false; status: 404 | 409; error: string } {
  if (!draft) {
    return {
      ok: false,
      status: 404,
      error: 'Invoice scan was not found. Scan the invoice again.',
    };
  }
  if (draft.expiresAt.getTime() < now) {
    return {
      ok: false,
      status: 409,
      error: 'Invoice scan expired. Scan the invoice again.',
    };
  }
  const sampleReason = sampleInvoiceCommitRejection({
    invoiceNumber: draft.payload.invoiceNumber,
  });
  if (sampleReason) return { ok: false, status: 409, error: sampleReason };
  if (!draft.payload.vendorName?.trim() || !draft.payload.invoiceNumber?.trim()) {
    return {
      ok: false,
      status: 409,
      error: 'Vendor name and invoice number are required before this scan can post.',
    };
  }
  return { ok: true };
}
