import { prisma } from '@/lib/domains/inventory/ledger';
import type { ReceivingLog } from '@/lib/domains/receiving/yieldPricing';

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

export interface RecordedReceivingLogs {
  success: true;
  source: 'ledger';
  logs: ReceivingLog[];
  warning: null;
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
    canPost: true,
  };
}

/** Saved deliveries. Empty when none have been posted. */
export async function listReceivingDeliveryLogs(): Promise<RecordedReceivingLogs> {
  const rows = await prisma.receivingDelivery.findMany({
    orderBy: { createdAt: 'desc' },
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
  return {
    success: true,
    source: 'ledger',
    logs: rows.map(receivingDeliveryToLog),
    warning: null,
  };
}
