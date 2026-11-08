import { createHash } from 'node:crypto';

/**
 * Receiving delivery identity.
 *
 * Google Sheets is read with the values API only. This app does not write the
 * sheet, so it cannot store a UUID it invents on each read. A delivery id is
 * valid only when the source already persisted one:
 * - Sheet column "Delivery ID", "Line ID", or "External ID"
 * - A client line that called crypto.randomUUID() once when the line was created
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const POSITIONAL_RE = /^sheet-row-\d+$/i;
const UNASSIGNED_RE = /^unassigned-sheet-row-\d+$/i;

export function isDeliveryUuid(value: string): boolean {
  const id = value.trim();
  if (id === '00000000-0000-0000-0000-000000000000') return false;
  return UUID_RE.test(id);
}

export function normalizeDeliveryUuid(value: string): string | null {
  const id = value.trim().toLowerCase();
  return isDeliveryUuid(id) ? id : null;
}

/** Display-only or historical row indexes. Never claim these as a new receive. */
export function isRetiredPositionalDeliveryId(value: string): boolean {
  const id = value.trim();
  return POSITIONAL_RE.test(id) || UNASSIGNED_RE.test(id);
}

export interface ReceivingDeliveryFingerprint {
  itemName: string;
  productId?: string | null;
  casesReceived: number;
  caseCost: number;
  packSize: number;
  splitFactor: number;
  retailPrice: number;
  caseRetailPrice?: number | null;
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
    retailPrice: normQty(input.retailPrice),
    caseRetailPrice:
      input.caseRetailPrice != null && input.caseRetailPrice > 0
        ? normQty(input.caseRetailPrice)
        : null,
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
