import { createHash } from 'node:crypto';
export {
  isDeliveryUuid,
  normalizeDeliveryUuid,
  normalizeInvoiceIdentity,
  RECEIVING_INVOICE_NAMESPACE,
  uuidV5,
} from '@/lib/domains/receiving/invoiceDeliveryId';

/**
 * Receiving delivery identity.
 *
 * Google Sheets is read with the values API only. This app does not write the
 * sheet, so it cannot store a UUID it invents on each read. A delivery id is
 * valid only when the source already persisted one:
 * - Sheet column "Delivery ID", "Line ID", or "External ID"
 * - A numbered invoice line, whose UUID v5 is derived from the invoice number and line slot
 *
 * Row numbers and content hashes are not identities. `sheet-row-N` keys already
 * in the ledger stay there and are not reused for new posts.
 */

export const DELIVERY_ID_HEADERS = new Set([
  'delivery id',
  'line id',
  'external id',
  'deliveryid',
  'lineid',
  'externalid',
]);

export const RETIRED_POSITIONAL_DELIVERY_ERROR =
  'Row-position ids such as sheet-row-2 are retired and were not posted. Add a new Delivery ID (UUID) on that delivery. Existing ledger history was not changed.';

export const DELIVERY_UUID_REQUIRED_ERROR =
  'A Delivery ID (UUID) persisted on the source line is required. FreshLoop does not assign one from the row number.';

export const DELIVERY_PAYLOAD_CONFLICT_ERROR =
  'This Delivery ID was already received with a different item, quantity, or cost. Use a new UUID for a new delivery.';

export const LEGACY_SCAN_STASH_ERROR =
  'This line still uses a pre-UUID scan id (scan-…). Open the invoice again so each numbered line gets a stable Delivery ID. That old id was not posted, and existing ledger rows were not removed.';

const POSITIONAL_RE = /^sheet-row-\d+$/i;
const UNASSIGNED_RE = /^unassigned-sheet-row-\d+$/i;
const UNASSIGNED_INVOICE_RE = /^unassigned-invoice-line-\d+$/i;
const LEGACY_SCAN_RE = /^scan-/i;

/** Display-only or historical row indexes. Never claim these as a new receive. */
export function isRetiredPositionalDeliveryId(value: string): boolean {
  const id = value.trim();
  return POSITIONAL_RE.test(id) || UNASSIGNED_RE.test(id) || UNASSIGNED_INVOICE_RE.test(id);
}

/** Browser stashes from before UUID delivery ids. Rejected, not replayed. */
export function isLegacyScanDeliveryId(value: string): boolean {
  return LEGACY_SCAN_RE.test(value.trim());
}

export interface ReceivingDeliveryFingerprint {
  itemName: string;
  productId?: string | null;
  casesReceived: number;
  caseCost: number;
  packSize: number;
  splitFactor: number;
}

function normQty(value: number): number {
  return Number(value.toFixed(4));
}

/** Stable comparison payload. The UUID remains the identity; this only detects edits. */
export function receivingDeliveryPayloadHash(input: ReceivingDeliveryFingerprint): string {
  const canonical = JSON.stringify({
    itemName: input.itemName.trim().toLowerCase(),
    productId: input.productId?.trim() || null,
    casesReceived: normQty(input.casesReceived),
    caseCost: normQty(input.caseCost),
    packSize: normQty(input.packSize),
    splitFactor: normQty(input.splitFactor),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export class ReceivingDeliveryConflict extends Error {
  readonly status = 409 as const;
  constructor(message = DELIVERY_PAYLOAD_CONFLICT_ERROR) {
    super(message);
    this.name = 'ReceivingDeliveryConflict';
  }
}
