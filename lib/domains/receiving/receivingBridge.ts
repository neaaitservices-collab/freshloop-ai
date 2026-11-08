import type { InvoiceOcrResult } from '@/lib/types';
import type { ReceivingLog, RetailUnit } from '@/lib/domains/receiving/yieldPricing';

export const RECEIVING_SCAN_STORAGE_KEY = 'freshloop-receiving-scan-v1';

function retailUnitFromSubUnit(subUnit: string | undefined): RetailUnit {
  const value = (subUnit || '').toLowerCase();
  if (value.includes('quart')) return 'quarts';
  if (value === 'lb' || value === 'lbs' || value.includes('pound')) return 'lbs';
  return 'units';
}

/** Maps OCR output into receiving-board rows. Ids stay unposted until the server assigns them. */
export function receivingLogsFromInvoice(result: InvoiceOcrResult): ReceivingLog[] {
  const lines = result.lineItems.filter((item) => item.name && Number(item.unitCost) >= 0);
  return lines
    .map((item, index) => {
      const catalogName = item.matchedProductName?.trim();
      const productId = item.productId?.trim();
      return {
        id: `unassigned-invoice-line-${index + 1}`,
        canPost: false,
        invoiceNumber: result.invoiceNumber,
        invoiceDate: result.invoiceDate,
        printedName: item.name,
        itemName: item.name,
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
