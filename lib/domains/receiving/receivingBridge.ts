import type { InvoiceOcrResult } from '@/lib/types';
import { DEMO_INVOICE_NUMBER } from '@/lib/domains/receiving/sampleReceivingGuard';
import type { ReceivingLog, RetailUnit } from '@/lib/domains/receiving/yieldPricing';

export const RECEIVING_SCAN_STORAGE_KEY = 'freshloop-receiving-scan-v1';

function retailUnitFromSubUnit(subUnit: string | undefined): RetailUnit {
  const value = (subUnit || '').toLowerCase();
  if (value.includes('quart')) return 'quarts';
  if (value === 'lb' || value === 'lbs' || value.includes('pound')) return 'lbs';
  return 'units';
}

function stableLogId(result: { invoiceNumber: string }, item: InvoiceOcrResult['lineItems'][number], index: number): string {
  const slug = (item.productId || item.name || `line-${index}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 48);
  return `scan-${result.invoiceNumber}-${slug}`;
}

/** One UUID per new invoice line. The practice invoice keeps its reserved id. */
export function newReceivingDeliveryId(
  result: Pick<InvoiceOcrResult, 'invoiceNumber'>,
  item: InvoiceOcrResult['lineItems'][number],
  index: number
): string {
  if (result.invoiceNumber.trim().toLowerCase() === DEMO_INVOICE_NUMBER.toLowerCase()) {
    return stableLogId(result, item, index);
  }
  return crypto.randomUUID();
}

/** Maps OCR output into receiving-board rows (pricing happens before `postReceipt`). */
export function receivingLogsFromInvoice(result: InvoiceOcrResult): ReceivingLog[] {
  return result.lineItems
    .filter((item) => item.name && Number(item.unitCost) >= 0)
    .map((item, index) => {
      const catalogName = item.matchedProductName?.trim();
      const productId = item.productId?.trim();
      return {
        id: newReceivingDeliveryId(result, item, index),
        itemName: catalogName || item.name,
        invoiceLineName: catalogName && catalogName !== item.name ? item.name : undefined,
        productId: productId || undefined,
        casesReceived: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        caseCost: (() => {
          const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
          const total = Number(item.totalCost) || 0;
          const unit = Number(item.unitCost) || 0;
          if (total > 0 && qty > 0) return Number((total / qty).toFixed(4));
          return unit;
        })(),
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
