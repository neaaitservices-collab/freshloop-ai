import { prisma } from '@/lib/domains/inventory/ledger';
import {
  canonicalInvoiceNumber,
  canonicalPrintedLine,
  INVOICE_NUMBER_REUSE_POLICY,
  SUPPLIER_REQUIRED_ERROR,
} from '@/lib/domains/receiving/invoiceDeliveryId';
import {
  postReceivingLogToInventory,
  type ReceivingLogPostInput,
  type ReceivingLogPostResult,
} from '@/lib/domains/receiving/receivingLogPost';
import { normalizeProductPackFields } from '@/lib/domains/inventory/stock';

export const INVOICE_NUMBER_REQUIRED_ERROR =
  'This scan has no invoice number, so it was not given a delivery id. Enter the number from the paper and scan again.';

export const SUPPLIER_UNKNOWN_ERROR =
  'That supplier is not in the directory. Choose a saved supplier before receiving this invoice.';

export const INVOICE_LINE_MISMATCH_ERROR =
  'This scan does not line up with the lines already stored for that supplier and invoice number. No new delivery was created. Check the printed line text, or use a new invoice number if this is a different document.';

export { INVOICE_NUMBER_REUSE_POLICY, SUPPLIER_REQUIRED_ERROR };

export type SupplierInvoiceFailure =
  | 'SUPPLIER_REQUIRED'
  | 'SUPPLIER_UNKNOWN'
  | 'INVOICE_NUMBER_REQUIRED'
  | 'LINE_MISMATCH'
  | 'PRINTED_LINE_REQUIRED';

export interface ResolvedInvoiceLine {
  deliveryId: string;
  printedKey: string;
  occurrence: number;
  ordinal: number;
}

export type ResolveSupplierInvoiceResult =
  | { ok: true; created: boolean; invoiceKey: string; lines: ResolvedInvoiceLine[] }
  | { ok: false; code: SupplierInvoiceFailure; error: string };

export interface InvoiceIdentityLineInput {
  printedName: string;
}

function lineSlots(lines: InvoiceIdentityLineInput[]): { printedKey: string; occurrence: number }[] | null {
  const counts = new Map<string, number>();
  const slots: { printedKey: string; occurrence: number }[] = [];
  for (const line of lines) {
    const printedKey = canonicalPrintedLine(line.printedName);
    if (!printedKey) return null;
    const occurrence = counts.get(printedKey) ?? 0;
    counts.set(printedKey, occurrence + 1);
    slots.push({ printedKey, occurrence });
  }
  return slots;
}

/**
 * First sight of a saved supplier plus invoice number assigns line UUIDs.
 * A later scan reuses those rows when the printed text aligns.
 * Catalog product ids are not part of this identity.
 * Invoice date is recorded on insert and does not fork the document.
 */
export async function resolveSupplierInvoice(input: {
  supplierId?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  lines: InvoiceIdentityLineInput[];
}): Promise<ResolveSupplierInvoiceResult> {
  const supplierId = input.supplierId?.trim() ?? '';
  if (!supplierId) return { ok: false, code: 'SUPPLIER_REQUIRED', error: SUPPLIER_REQUIRED_ERROR };
  const invoiceKey = canonicalInvoiceNumber(input.invoiceNumber);
  if (!invoiceKey) {
    return { ok: false, code: 'INVOICE_NUMBER_REQUIRED', error: INVOICE_NUMBER_REQUIRED_ERROR };
  }
  const slots = lineSlots(input.lines);
  if (!slots) {
    return {
      ok: false,
      code: 'PRINTED_LINE_REQUIRED',
      error: 'Each invoice line needs the printed description before it can be identified.',
    };
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } });
  if (!supplier) return { ok: false, code: 'SUPPLIER_UNKNOWN', error: SUPPLIER_UNKNOWN_ERROR };

  try {
    return await writeSupplierInvoice(supplierId, invoiceKey, input, slots);
  } catch (error) {
    const unique =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002';
    if (!unique) throw error;
    return writeSupplierInvoice(supplierId, invoiceKey, input, slots);
  }
}

async function writeSupplierInvoice(
  supplierId: string,
  invoiceKey: string,
  input: { invoiceNumber?: string | null; invoiceDate?: string | null },
  slots: { printedKey: string; occurrence: number }[]
): Promise<ResolveSupplierInvoiceResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.supplierInvoiceDocument.findUnique({
      where: { supplierId_invoiceKey: { supplierId, invoiceKey } },
      include: { lines: true },
    });
    if (!existing) {
      const created = await tx.supplierInvoiceDocument.create({
        data: {
          supplierId,
          invoiceKey,
          invoiceNumber: (input.invoiceNumber ?? '').trim(),
          invoiceDate: input.invoiceDate?.trim() || null,
          lines: {
            create: slots.map((slot, ordinal) => ({
              printedKey: slot.printedKey,
              occurrence: slot.occurrence,
              ordinal,
            })),
          },
        },
        include: { lines: true },
      });
      return {
        ok: true as const,
        created: true,
        invoiceKey,
        lines: created.lines
          .slice()
          .sort((a, b) => a.ordinal - b.ordinal)
          .map((line) => ({
            deliveryId: line.id,
            printedKey: line.printedKey,
            occurrence: line.occurrence,
            ordinal: line.ordinal,
          })),
      };
    }

    const bySlot = new Map(existing.lines.map((line) => [`${line.printedKey}\n${line.occurrence}`, line]));
    const resolved: ResolvedInvoiceLine[] = [];
    for (const [ordinal, slot] of slots.entries()) {
      const found = bySlot.get(`${slot.printedKey}\n${slot.occurrence}`);
      if (!found) {
        return { ok: false as const, code: 'LINE_MISMATCH' as const, error: INVOICE_LINE_MISMATCH_ERROR };
      }
      resolved.push({
        deliveryId: found.id,
        printedKey: found.printedKey,
        occurrence: found.occurrence,
        ordinal,
      });
    }
    return { ok: true as const, created: false, invoiceKey, lines: resolved };
  });
}

export interface NumberedInvoicePostLine {
  printedName: string;
  productId?: string | null;
  quantity: number;
  unitCost: number;
  quantityKind?: 'units' | 'cases';
  casePackSize?: number | null;
}

/** Board saves and OCR commit both post these delivery ids. */
export async function postResolvedSupplierInvoice(input: {
  staffId: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate?: string | null;
  lines: NumberedInvoicePostLine[];
}): Promise<
  | { ok: false; code: SupplierInvoiceFailure; error: string }
  | { ok: true; invoiceKey: string; results: ReceivingLogPostResult[] }
> {
  const resolved = await resolveSupplierInvoice({
    supplierId: input.supplierId,
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate,
    lines: input.lines.map((line) => ({ printedName: line.printedName })),
  });
  if (!resolved.ok) return resolved;

  const results: ReceivingLogPostResult[] = [];
  for (const [index, line] of input.lines.entries()) {
    const identity = resolved.lines[index];
    if (!identity) {
      return { ok: false, code: 'LINE_MISMATCH', error: INVOICE_LINE_MISMATCH_ERROR };
    }
    let pack = 1;
    if (line.quantityKind === 'cases') {
      const product = line.productId
        ? await prisma.product.findUnique({
            where: { id: line.productId },
            select: { receivePackSize: true, splitFactor: true, casePackSize: true },
          })
        : null;
      pack = product
        ? normalizeProductPackFields(product).casePackSize
        : line.casePackSize && line.casePackSize > 0
          ? line.casePackSize
          : 1;
    }
    const post: ReceivingLogPostInput = {
      itemName: line.printedName.trim(),
      productId: line.productId?.trim() || undefined,
      casesReceived: line.quantity,
      caseCost: line.unitCost,
      packSize: pack,
      splitFactor: 1,
      retailUnit: 'units',
      marginMode: '40',
      currentRetailPrice: 0,
      externalLogId: identity.deliveryId,
      supplierId: input.supplierId,
    };
    results.push(await postReceivingLogToInventory(post, input.staffId, null));
  }
  return { ok: true, invoiceKey: resolved.invoiceKey, results };
}
