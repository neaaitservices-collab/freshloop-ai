import type { InvoiceOcrResult } from '@/lib/types';
import { isDeliveryUuid } from '@/lib/domains/receiving/deliveryIdentity';
import { DEMO_INVOICE_NUMBER } from '@/lib/domains/receiving/sampleReceivingGuard';
import type { ReceivingLog, RetailUnit } from '@/lib/domains/receiving/yieldPricing';

export const RECEIVING_SCAN_STORAGE_KEY = 'freshloop-receiving-scan-v1';

function retailUnitFromSubUnit(subUnit: string | undefined): RetailUnit {
  const value = (subUnit || '').toLowerCase();
  if (value.includes('quart')) return 'quarts';
  if (value === 'lb' || value === 'lbs' || value.includes('pound')) return 'lbs';
  return 'units';
}

/**
 * Receiving id for an OCR line.
 * Real lines use the UUID stored on the server draft. Quantity, cost, name,
 * and order are not part of the id. The practice invoice keeps a reserved id.
 */
export function receivingLineId(
  result: Pick<InvoiceOcrResult, 'invoiceNumber'>,
  item: InvoiceOcrResult['lineItems'][number],
  index: number
): string | null {
  if (result.invoiceNumber.trim().toLowerCase() === DEMO_INVOICE_NUMBER.toLowerCase()) {
    return `scan-${DEMO_INVOICE_NUMBER.toLowerCase()}-${index}`;
  }
  return isDeliveryUuid(item.deliveryId) ? item.deliveryId!.trim().toLowerCase() : null;
}

/** Maps OCR output into receiving-board rows. Lines without a server UUID are omitted. */
export function receivingLogsFromInvoice(result: InvoiceOcrResult): ReceivingLog[] {
  return result.lineItems
    .filter((item) => item.name && Number(item.unitCost) >= 0)
    .map((item, index) => ({ item, index, id: receivingLineId(result, item, index) }))
    .filter((row): row is { item: (typeof result.lineItems)[number]; index: number; id: string } =>
      Boolean(row.id)
    )
    .map(({ item, id }) => {
      const catalogName = item.matchedProductName?.trim();
      const productId = item.productId?.trim();
      const qty = Number(item.quantity);
      const total = Number(item.totalCost) || 0;
      const unit = Number(item.unitCost) || 0;
      return {
        id,
        itemName: catalogName || item.name,
        invoiceLineName: catalogName && catalogName !== item.name ? item.name : undefined,
        productId: productId || undefined,
        casesReceived: qty > 0 ? qty : 0,
        caseCost: total > 0 && qty > 0 ? Number((total / qty).toFixed(4)) : unit,
        packSize: Number(item.casePackSize) > 0 ? Number(item.casePackSize) : undefined,
        retailUnit: retailUnitFromSubUnit(item.subUnit),
        suggestedCaseFloorPrice:
          typeof item.caseRetailPrice === 'number' && item.caseRetailPrice > 0
            ? item.caseRetailPrice
            : undefined,
      };
    });
}

export function stashInvoiceForReceiving(result: InvoiceOcrResult): void {
  if (typeof window === 'undefined') return;
  const logs = receivingLogsFromInvoice(result);
  sessionStorage.setItem(
    RECEIVING_SCAN_STORAGE_KEY,
    JSON.stringify({
      logs,
      note: logs.length
        ? `${result.vendorName} · ${result.invoiceNumber} · ${logs.length} cases ready to price`
        : null,
    })
  );
}

export function consumeStashedReceivingScan(): {
  logs: ReceivingLog[];
  note: string | null;
} | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(RECEIVING_SCAN_STORAGE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(RECEIVING_SCAN_STORAGE_KEY);
  try {
    const parsed = JSON.parse(raw) as { logs?: ReceivingLog[]; note?: string | null };
    if (!Array.isArray(parsed.logs) || parsed.logs.length === 0) return null;
    return { logs: parsed.logs, note: parsed.note ?? null };
  } catch {
    return null;
  }
}
