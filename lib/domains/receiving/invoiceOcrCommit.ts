import { Department, InventoryLocation } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { findOrCreatePurchaseProduct, postProductReceipt } from '@/lib/domains/inventory/stock';

export type OcrQuantityKind = 'units' | 'cases';

export interface OcrCommitLine {
  product_id: string;
  quantity: number;
  quantity_kind?: OcrQuantityKind;
  unit_cost: number;
  to_location?: InventoryLocation;
  line_name?: string;
  department?: Department;
  case_pack_size?: number;
}

export interface OcrInvoiceMeta {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  departmentBreakdown: Record<string, number>;
  rawOcrJson?: unknown;
}

function packSizeFor(line: OcrCommitLine, casePackSize: number): number {
  if (line.case_pack_size && line.case_pack_size > 0) return line.case_pack_size;
  return casePackSize > 0 ? casePackSize : 1;
}

/** Case invoices quote a cost per case; inventory stores a per-unit cost and retail units. */
export function resolveInvoiceReceipt(
  line: OcrCommitLine,
  casePackSize: number
): { units: number; unitCost: number } {
  const raw = Math.abs(Number(line.quantity) || 0);
  const rawCost = Math.max(0, Number.isFinite(Number(line.unit_cost)) ? Number(line.unit_cost) : 0);
  if (!(raw > 0)) return { units: 0, unitCost: 0 };
  const pack = packSizeFor(line, casePackSize);
  if ((line.quantity_kind ?? 'units') === 'cases') {
    const safePack = pack > 0 ? pack : 1;
    return {
      units: Number((raw * safePack).toFixed(4)),
      unitCost: Number((rawCost / safePack).toFixed(4)),
    };
  }
  return {
    units: Number(raw.toFixed(4)),
    unitCost: Number(rawCost.toFixed(4)),
  };
}

export async function commitInvoiceOcrReceipts(input: {
  staffId: string;
  referenceId: string;
  confirmedItems: OcrCommitLine[];
  invoiceMeta?: OcrInvoiceMeta | null;
}) {
  if (input.confirmedItems.length === 0) {
    throw new Error('No confirmed invoice lines to receive.');
  }

  const result = await prisma.$transaction(
    async (tx) => {
      let invoiceId: string | null = null;
      if (input.invoiceMeta) {
        const meta = input.invoiceMeta;
        const invoice = await tx.vendorInvoice.create({
          data: {
            vendorName: meta.vendorName,
            invoiceNumber: meta.invoiceNumber,
            invoiceDate: new Date(meta.invoiceDate),
            totalAmount: meta.totalAmount,
            departmentBreakdown: meta.departmentBreakdown,
            rawOcrJson: meta.rawOcrJson ?? undefined,
            status: 'RECEIVED',
          },
        });
        invoiceId = invoice.id;
      }

      const receipts = [];
      for (const item of input.confirmedItems) {
        let productId = String(item.product_id ?? '').trim();
        if (!productId) {
          const lineName = item.line_name?.trim();
          if (!lineName) {
            throw new Error('Each invoice line needs a catalog match or a line name to create a product.');
          }
          const ensured = await findOrCreatePurchaseProduct(
            {
              itemName: lineName,
              department: item.department,
              casePackSize: item.case_pack_size,
              unitCost: Number(item.unit_cost) > 0 ? Number(item.unit_cost) : undefined,
            },
            tx
          );
          productId = ensured.id;
        }

        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { casePackSize: true, name: true, department: true },
        });
        if (!product) {
          throw new Error(`Product was not found: ${productId}`);
        }

        const pack = product.casePackSize && product.casePackSize > 0 ? product.casePackSize : 1;
        const { units, unitCost } = resolveInvoiceReceipt(item, pack);
        if (!(units > 0)) {
          throw new Error(`Receive quantity must be greater than zero for ${product.name}.`);
        }

        const receipt = await postProductReceipt(
          {
            productId,
            quantityUnits: units,
            unitCostAtTime: unitCost,
            staffId: input.staffId,
            referenceId: input.referenceId,
            toLocation: item.to_location ?? InventoryLocation.Retail_Floor,
            notes: 'Confirmed Invoice OCR Receipt',
          },
          tx
        );
        receipts.push(receipt);

        if (invoiceId) {
          await tx.invoiceLineItem.create({
            data: {
              invoiceId,
              name: item.line_name ?? product.name,
              department: item.department ?? product.department,
              quantity: units,
              unit: 'units',
              unitCost,
              totalCost: Number((unitCost * units).toFixed(2)),
              casePackSize: pack,
            },
          });
        }
      }

      return {
        invoiceId,
        receipts,
        transactionsCreated: receipts.length,
      };
    },
    { timeout: 20_000 }
  );

  invalidateInventoryCaches();
  return result;
}
