import type { InvoiceOcrResult } from '@/lib/types';
import {
  normalizeInvoiceIdentity,
  uuidV5,
} from '@/lib/domains/receiving/invoiceDeliveryId';
import { DEMO_INVOICE_NUMBER } from '@/lib/domains/receiving/sampleReceivingGuard';
import type { ReceivingLog, RetailUnit } from '@/lib/domains/receiving/yieldPricing';

export const RECEIVING_SCAN_STORAGE_KEY = 'freshloop-receiving-scan-v1';

function retailUnitFromSubUnit(subUnit: string | undefined): RetailUnit {
  const value = (subUnit || '').toLowerCase();
  if (value.includes('quart')) return 'quarts';
  if (value === 'lb' || value === 'lbs' || value.includes('pound')) return 'lbs';
  return 'units';
}

type InvoiceLine = InvoiceOcrResult['lineItems'][number];

function stableLogId(result: { invoiceNumber: string }, item: InvoiceLine, index: number): string {
  const slug = (item.productId || item.name || `line-${index}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 48);
  return `scan-${result.invoiceNumber}-${slug}`;
}

function invoiceLineSlot(item: InvoiceLine): string {
  const product = item.productId?.trim();
  if (product) return `product:${product.toLowerCase()}`;
  const name = (item.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return name ? `name:${name}` : 'line:blank';
}

/**
 * Stable UUID for one line on a numbered invoice.
 * The same invoice number, line slot, and occurrence always yield the same id.
 * Quantity and price are not part of the name. A blank invoice number returns null.
 */
export function invoiceLineDeliveryId(
  invoiceNumber: string | null | undefined,
  lines: InvoiceLine[],
  index: number
): string | null {
  if ((invoiceNumber ?? '').trim().toLowerCase() === DEMO_INVOICE_NUMBER.toLowerCase()) {
    const item = lines[index];
    if (!item) return null;
    return stableLogId({ invoiceNumber: DEMO_INVOICE_NUMBER }, item, index);
  }
  const invoice = normalizeInvoiceIdentity(invoiceNumber);
  const item = lines[index];
  if (!invoice || !item) return null;
  const slot = invoiceLineSlot(item);
  let occurrence = 0;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (invoiceLineSlot(lines[cursor]!) === slot) occurrence += 1;
  }
  return uuidV5(`invoice\n${invoice}\n${slot}\n${occurrence}`);
}

/** Maps OCR output into receiving-board rows (pricing happens before `postReceipt`). */
export function receivingLogsFromInvoice(result: InvoiceOcrResult): ReceivingLog[] {
  const lines = result.lineItems.filter((item) => item.name && Number(item.unitCost) >= 0);
  const invoiceKnown = normalizeInvoiceIdentity(result.invoiceNumber) !== null
    || result.invoiceNumber.trim().toLowerCase() === DEMO_INVOICE_NUMBER.toLowerCase();
  return lines
    .map((item, index) => {
      const catalogName = item.matchedProductName?.trim();
      const productId = item.productId?.trim();
      const deliveryId = invoiceLineDeliveryId(result.invoiceNumber, lines, index);
      return {
        id: deliveryId ?? `unassigned-invoice-line-${index + 1}`,
        canPost: Boolean(deliveryId) && invoiceKnown && !deliveryId?.startsWith('scan-'),
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
