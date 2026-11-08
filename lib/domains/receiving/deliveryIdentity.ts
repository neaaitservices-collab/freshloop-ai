/**
 * Delivery identity is a UUID assigned once by the server.
 * The fingerprint is a separate canonical description of the posted facts.
 * Changing quantity, cost, pack, supplier, or product must not mint a new id.
 * This module is imported by the receiving screen, so it does not use node:crypto.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const RECEIPT_FP_PREFIX = 'FLFP1:';

export function isDeliveryUuid(value: string | null | undefined): boolean {
  const id = value?.trim() ?? '';
  if (!id || id === '00000000-0000-0000-0000-000000000000') return false;
  return UUID_RE.test(id);
}

export function normalizeDeliveryUuid(value: string | null | undefined): string | null {
  const id = value?.trim().toLowerCase() ?? '';
  return isDeliveryUuid(id) ? id : null;
}

/** Server and browser both provide randomUUID. Call this only when assigning a new line. */
export function newDeliveryUuid(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID is required to assign a delivery id.');
  }
  return crypto.randomUUID().toLowerCase();
}

export interface ReceiptFacts {
  itemName: string;
  productId?: string | null;
  casesReceived: number;
  caseCost: number;
  packSize: number;
  splitFactor: number;
  supplier?: string | null;
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

/** Immutable facts for one delivery. Identity is not part of this string. */
export function receiptFingerprint(facts: ReceiptFacts): string {
  return JSON.stringify({
    itemName: facts.itemName.trim(),
    productId: facts.productId?.trim() || null,
    casesReceived: round4(facts.casesReceived),
    caseCost: round4(facts.caseCost),
    packSize: round4(facts.packSize),
    splitFactor: round4(facts.splitFactor),
    supplier: facts.supplier?.trim() || null,
  });
}

export function receiptNotes(summary: string, fingerprint: string): string {
  return `${RECEIPT_FP_PREFIX}${fingerprint}\n${summary}`;
}

export function fingerprintFromNotes(notes: string | null | undefined): string | null {
  if (!notes?.startsWith(RECEIPT_FP_PREFIX)) return null;
  const end = notes.indexOf('\n');
  const raw = end === -1 ? notes.slice(RECEIPT_FP_PREFIX.length) : notes.slice(RECEIPT_FP_PREFIX.length, end);
  return raw || null;
}

export const RECEIPT_CONFLICT_REASON =
  'This delivery id was already received with different item, quantity, cost, pack, or supplier. It was not posted again.';
