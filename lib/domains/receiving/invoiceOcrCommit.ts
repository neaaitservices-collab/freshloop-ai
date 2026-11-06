import { Department, InventoryLocation } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import {
  findOrCreatePurchaseProduct,
  normalizeProductPackFields,
  postProductReceipt,
  productPackWriteData,
} from '@/lib/domains/inventory/stock';
import { resolveSupplierIdForVendorName } from '@/lib/domains/suppliers/suppliers';

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
  supplierId?: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  departmentBreakdown: Record<string, number>;
  rawOcrJson?: unknown;
}

/** Case invoices quote a cost per case; inventory stores a per-unit cost and retail units. */
export function resolveInvoiceReceipt(
  line: OcrCommitLine,
  sellableUnitsPerCase: number
): { units: number; unitCost: number } {
  const raw = Math.abs(Number(line.quantity) || 0);
  const rawCost = Math.max(0, Number.isFinite(Number(line.unit_cost)) ? Number(line.unit_cost) : 0);
  if (!(raw > 0)) return { units: 0, unitCost: 0 };
  const pack = sellableUnitsPerCase > 0 ? sellableUnitsPerCase : 1;
  if ((line.quantity_kind ?? 'units') === 'cases') {
    return {
      units: Number((raw * pack).toFixed(4)),
      unitCost: Number((rawCost / pack).toFixed(4)),
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
        const supplierId =
          meta.supplierId?.trim() ||
          (await resolveSupplierIdForVendorName(meta.vendorName, tx));
        const invoice = await tx.vendorInvoice.create({
          data: {
            vendorName: meta.vendorName,
            supplierId,
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
          const linePack =
            item.case_pack_size && item.case_pack_size > 0 ? item.case_pack_size : undefined;
          const ensured = await findOrCreatePurchaseProduct(
            {
              itemName: lineName,
              department: item.department,
              receivePackSize: linePack,
              casePackSize: linePack,
              unitCost: Number(item.unit_cost) > 0 ? Number(item.unit_cost) : undefined,
            },
            tx
          );
          productId = ensured.id;
        }

        let product = await tx.product.findUnique({
          where: { id: productId },
          select: {
            casePackSize: true,
            receivePackSize: true,
            splitFactor: true,
            name: true,
            department: true,
          },
        });
        if (!product) {
          throw new Error(`Product was not found: ${productId}`);
        }

        if (item.case_pack_size && item.case_pack_size > 0) {
          const divisor =
            product.splitFactor && product.splitFactor > 0 ? product.splitFactor : 1;
          const packData = productPackWriteData(item.case_pack_size, divisor);
          product = await tx.product.update({
            where: { id: productId },
            data: packData,
            select: {
              casePackSize: true,
              receivePackSize: true,
              splitFactor: true,
              name: true,
              department: true,
            },
          });
        }

        const packFields = normalizeProductPackFields({
          receivePackSize: product.receivePackSize,
          splitFactor: product.splitFactor,
          casePackSize: product.casePackSize,
        });
        const { units, unitCost } = resolveInvoiceReceipt(item, packFields.casePackSize);
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
              casePackSize: packFields.receivePackSize,
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
