import { canonicalInvoiceNumber } from '@/lib/domains/receiving/invoiceDeliveryId';

/**
 * Cards for the Recent deliveries swipe strip, and the Saved deliveries list under it.
 * Both are the invoice currently scanned or open, matched on supplier and invoice number.
 * Supplier id is used when the line or the open invoice has one. Posted history stays in
 * the source list and is not removed here.
 */
export interface ReceivingStripSupplier {
  supplierId?: string | null;
  supplierName?: string | null;
}

type StripLog = {
  id: string;
  invoiceNumber?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  vendorName?: string | null;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function supplierNameOf(
  log: { supplierName?: string | null; vendorName?: string | null },
  fallback?: string | null
): string | null {
  const raw = clean(log.supplierName) ?? clean(log.vendorName) ?? clean(fallback);
  return raw ? raw.replace(/\s+/g, ' ').toLowerCase() : null;
}

/**
 * True when both lines are the same supplier. Id wins when both sides have one.
 * A candidate with no supplier id and no supplier name matches only when it is
 * one of the open invoice lines.
 */
function sameReceivingSupplier(
  active: StripLog,
  candidate: StripLog,
  activeInvoiceIds: ReadonlySet<string>,
  fallback?: ReceivingStripSupplier
): boolean {
  const activeId = clean(active.supplierId) ?? clean(fallback?.supplierId);
  const candidateId = clean(candidate.supplierId);
  if (activeId && candidateId) return activeId === candidateId;
  if (candidateId && !activeId) return false;
  if (activeId && !candidateId) {
    const candidateName = supplierNameOf(candidate);
    if (!candidateName) return activeInvoiceIds.has(candidate.id);
    const activeName = supplierNameOf(active, fallback?.supplierName);
    return Boolean(activeName && activeName === candidateName);
  }
  const activeName = supplierNameOf(active, fallback?.supplierName);
  const candidateName = supplierNameOf(candidate);
  if (activeName && candidateName) return activeName === candidateName;
  if (candidateName && !activeName) return false;
  return activeInvoiceIds.has(candidate.id);
}

function sameInvoice(active: StripLog, candidate: StripLog): boolean {
  const invoiceNumber = canonicalInvoiceNumber(candidate.invoiceNumber);
  if (!invoiceNumber) return false;
  return canonicalInvoiceNumber(active.invoiceNumber) === invoiceNumber;
}

/**
 * A line may be opened, priced, or received from the strip only when it belongs to
 * the open invoice's supplier and invoice number. No open invoice means no line.
 */
export function canActOnReceivingStripLine<T extends StripLog>(
  log: T,
  logs: readonly T[],
  activeInvoiceIds: ReadonlySet<string>,
  activeSupplier?: ReceivingStripSupplier
): boolean {
  if (activeInvoiceIds.size === 0) return false;
  for (const anchor of logs) {
    if (!activeInvoiceIds.has(anchor.id)) continue;
    if (!sameInvoice(anchor, log)) continue;
    if (sameReceivingSupplier(anchor, log, activeInvoiceIds, activeSupplier)) return true;
  }
  return false;
}

export function recentDeliveryStripItems<T extends StripLog>(
  logs: readonly T[],
  activeInvoiceIds: ReadonlySet<string>,
  activeSupplier?: ReceivingStripSupplier
): T[] {
  if (activeInvoiceIds.size === 0) return [];
  return logs.filter(
    (log) =>
      activeInvoiceIds.has(log.id) ||
      canActOnReceivingStripLine(log, logs, activeInvoiceIds, activeSupplier)
  );
}

/** Saved deliveries dropdown. Same supplier and invoice match as the strip. */
export function savedDeliveryChoices<T extends StripLog>(
  logs: readonly T[],
  activeInvoiceIds: ReadonlySet<string>,
  activeSupplier?: ReceivingStripSupplier
): T[] {
  return recentDeliveryStripItems(logs, activeInvoiceIds, activeSupplier);
}

/**
 * Line the receive screen may open and price. Null when no invoice is active,
 * and never a line from another supplier or invoice.
 */
export function openReceivingLine<T extends StripLog>(
  requestedId: string | null | undefined,
  logs: readonly T[],
  activeInvoiceIds: ReadonlySet<string>,
  activeSupplier?: ReceivingStripSupplier
): T | null {
  if (activeInvoiceIds.size === 0) return null;
  const allowed = recentDeliveryStripItems(logs, activeInvoiceIds, activeSupplier);
  const requested = requestedId ? allowed.find((log) => log.id === requestedId) : undefined;
  if (requested && canActOnReceivingStripLine(requested, logs, activeInvoiceIds, activeSupplier)) {
    return requested;
  }
  return (
    allowed.find((log) => canActOnReceivingStripLine(log, logs, activeInvoiceIds, activeSupplier)) ??
    null
  );
}
