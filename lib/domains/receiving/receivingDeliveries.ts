import { prisma } from '@/lib/domains/inventory/ledger';
import type { ReceivingLog } from '@/lib/domains/receiving/yieldPricing';

/** Newest posted receipts returned to the receive screen. */
export const RECEIVING_DELIVERY_LIST_LIMIT = 100;

export const RECEIVING_DELIVERIES_UNAVAILABLE =
  'Saved deliveries could not be read. The receiving_deliveries table is missing or the database is unavailable.';

/** Row written when a delivery posts, including invoice OCR commit. */
export interface ReceivingDeliveryRecord {
  id: string;
  itemName: string;
  casesReceived: number;
  caseCost: number;
  packSize: number;
  productId: string | null;
  catalogProductId: string | null;
}

export interface ReceivingDeliveryListResult {
  success: boolean;
  source: 'ledger';
  logs: ReceivingLog[];
  warning: string | null;
}

export function receivingDeliveryToLog(row: ReceivingDeliveryRecord): ReceivingLog {
  const productId = row.catalogProductId?.trim() || row.productId?.trim() || undefined;
  return {
    id: row.id,
    itemName: row.itemName,
    casesReceived: row.casesReceived,
    caseCost: row.caseCost,
    packSize: row.packSize > 0 ? row.packSize : undefined,
    productId,
    canPost: false,
  };
}

async function findPostedDeliveries(limit: number): Promise<ReceivingDeliveryRecord[]> {
  return prisma.receivingDelivery.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      itemName: true,
      casesReceived: true,
      caseCost: true,
      packSize: true,
      productId: true,
      catalogProductId: true,
    },
  });
}

/**
 * Posted deliveries only. They are read-only on the receive screen (`canPost: false`).
 * A missing table or other read failure returns a warning instead of throwing.
 */
export async function listReceivingDeliveryLogs(deps?: {
  findDeliveries?: (limit: number) => Promise<ReceivingDeliveryRecord[]>;
}): Promise<ReceivingDeliveryListResult> {
  const find = deps?.findDeliveries ?? findPostedDeliveries;
  try {
    const rows = await find(RECEIVING_DELIVERY_LIST_LIMIT);
    return {
      success: true,
      source: 'ledger',
      logs: rows.map(receivingDeliveryToLog),
      warning: null,
    };
  } catch {
    return {
      success: false,
      source: 'ledger',
      logs: [],
      warning: RECEIVING_DELIVERIES_UNAVAILABLE,
    };
  }
}
