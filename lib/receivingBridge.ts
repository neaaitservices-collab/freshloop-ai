import type { InvoiceOcrResult } from '@/lib/types';
import type { ReceivingLog, RetailUnit } from '@/lib/yieldPricing';

export const RECEIVING_SCAN_STORAGE_KEY = 'freshloop-receiving-scan-v1';

function retailUnitFromSubUnit(subUnit: string | undefined): RetailUnit {
  const value = (subUnit || '').toLowerCase();
  if (value.includes('quart')) return 'quarts';
  if (value === 'lb' || value === 'lbs' || value.includes('pound')) return 'lbs';
  return 'units';
}

function stableLogId(result: InvoiceOcrResult, item: InvoiceOcrResult['lineItems'][number], index: number): string {
  const slug = (item.productId || item.name || `line-${index}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 48);
  return `scan-${result.invoiceNumber}-${slug}`;
}

/** Maps OCR output into receiving-board rows (pricing happens before `postReceipt`). */
export function receivingLogsFromInvoice(result: InvoiceOcrResult): ReceivingLog[] {
  return result.lineItems
    .filter((item) => item.name && Number(item.unitCost) >= 0)
    .map((item, index) => ({
      id: stableLogId(result, item, index),
      itemName: item.name,
      casesReceived: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
      caseCost: Number(item.unitCost) || 0,
      packSize: Number(item.casePackSize) > 0 ? Number(item.casePackSize) : undefined,
      retailUnit: retailUnitFromSubUnit(item.subUnit),
    }));
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
