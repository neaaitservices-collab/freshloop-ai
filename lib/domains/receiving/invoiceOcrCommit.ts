import { Department, InventoryLocation, Prisma } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import {
  findOrCreatePurchaseProduct,
  normalizeProductPackFields,
  postProductReceipt,
  productPackWriteData,
  type PurchaseProductNameCatalog,
} from '@/lib/domains/inventory/stock';
import { resolveSupplierIdForVendorName } from '@/lib/domains/suppliers/suppliers';
import {
  INVOICE_OCR_CONFIDENCE_THRESHOLD,
  computeCommitLineConfidence,
  lineNeedsManualReview,
} from '@/lib/domains/receiving/invoiceOcrConfidence';
import { sampleInvoiceCommitRejection } from '@/lib/domains/receiving/sampleReceivingGuard';

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
  extraction_confidence?: number;
  match_confidence?: number;
  line_confidence?: number;
  needs_manual_review?: boolean;
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

type ReceiptProductRow = {
  id: string;
  casePackSize: number | null;
  receivePackSize: number | null;
  splitFactor: number | null;
  name: string;
  department: Department;
};

const receiptProductSelect = {
  casePackSize: true,
  receivePackSize: true,
  splitFactor: true,
  name: true,
  department: true,
} as const;

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

export function lowConfidenceCommitLines(
  lines: OcrCommitLine[],
  productNames: Map<string, string>
): OcrCommitLine[] {
  return lines.filter((line) => {
    if (line.needs_manual_review === true) return true;
    if (
      typeof line.line_confidence === 'number' &&
      lineNeedsManualReview(line.line_confidence)
    ) {
      return true;
    }
    const productName = productNames.get(line.product_id);
    const confidence = computeCommitLineConfidence(line, productName);
    return lineNeedsManualReview(confidence);
  });
}

export function assertInvoiceOcrCommitAllowed(input: {
  confirmedItems: OcrCommitLine[];
  productNames: Map<string, string>;
  manualReviewOverride?: boolean;
  actorIsManager: boolean;
}): void {
  const lowConfidence = lowConfidenceCommitLines(input.confirmedItems, input.productNames);
  if (lowConfidence.length === 0) return;

  if (!input.manualReviewOverride) {
    throw new Error(
      `${lowConfidence.length} invoice line(s) are below ${Math.round(
        INVOICE_OCR_CONFIDENCE_THRESHOLD * 100
      )}% OCR confidence. Human review is required before posting to inventory.`
    );
  }
  if (!input.actorIsManager) {
    throw new Error(
      'Only a store manager or admin may override low-confidence OCR lines and post to inventory.'
    );
  }
}

export const OCR_DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

export interface OcrDraftLine {
  product_id: string;
  quantity: number;
  quantity_kind?: OcrQuantityKind;
  unit_cost: number;
  line_name?: string;
  department?: Department;
  case_pack_size?: number;
  line_confidence: number;
  requires_approval: boolean;
}

export interface OcrDraftPayload {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  departmentBreakdown: Record<string, number>;
  lines: OcrDraftLine[];
}

export function invoiceIdempotencyKey(vendorName: string, invoiceNumber: string): string {
  return `invoice:${vendorName.trim().toLowerCase()}:${invoiceNumber.trim().toLowerCase()}`;
}

/** Commit uses the stored scan. Client confidence and cost flags are not an input. */
export function assertDraftLinesCommittable(
  lines: OcrDraftLine[],
  actorIsManager: boolean,
  manualReviewOverride: boolean
): void {
  const blocked = lines.filter(
    (line) => line.requires_approval || lineNeedsManualReview(line.line_confidence)
  );
  if (blocked.length === 0) return;
  if (manualReviewOverride && actorIsManager) return;
  throw new Error(
    `${blocked.length} invoice line(s) need a store manager before they can post. Low-confidence or cost-guardrail lines were not accepted from the browser.`
  );
}

export async function saveInvoiceOcrDraft(staffId: string, payload: OcrDraftPayload) {
  return prisma.invoiceOcrDraft.create({
    data: {
      staffId,
      payload: payload as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + OCR_DRAFT_TTL_MS),
    },
    select: { id: true },
  });
}

export async function commitInvoiceOcrReceipts(input: {
  staffId: string;
  referenceId: string;
  confirmedItems: OcrCommitLine[];
  invoiceMeta?: OcrInvoiceMeta | null;
  manualReviewOverride?: boolean;
  actorIsManager?: boolean;
  idempotencyKey?: string;
  draftId?: string;
}) {
  if (input.confirmedItems.length === 0) {
    throw new Error('No confirmed invoice lines to receive.');
  }
  const sampleReason = sampleInvoiceCommitRejection({
    invoiceNumber: input.invoiceMeta?.invoiceNumber,
    vendorName: input.invoiceMeta?.vendorName,
    lines: input.confirmedItems.map((line) => ({
      line_name: line.line_name,
      quantity: line.quantity,
      unit_cost: line.unit_cost,
    })),
  });
  if (sampleReason) {
    throw new Error(sampleReason);
  }

  const explicitProductIds = [
    ...new Set(
      input.confirmedItems
        .map((item) => String(item.product_id ?? '').trim())
        .filter(Boolean)
    ),
  ];
  const prefetchedNames = explicitProductIds.length
    ? await prisma.product.findMany({
        where: { id: { in: explicitProductIds } },
        select: { id: true, name: true },
      })
    : [];
  const productNames = new Map(prefetchedNames.map((row) => [row.id, row.name]));
  assertInvoiceOcrCommitAllowed({
    confirmedItems: input.confirmedItems,
    productNames,
    manualReviewOverride: input.manualReviewOverride,
    actorIsManager: Boolean(input.actorIsManager),
  });

  const result = await prisma.$transaction(
    async (tx) => {
      if (input.idempotencyKey) {
        await tx.ledgerIdempotencyKey.create({ data: { key: input.idempotencyKey } });
      }
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

      const nameCatalog: PurchaseProductNameCatalog = await tx.product.findMany({
        where: { isManufactured: false },
        select: { id: true, name: true },
      });

      const explicitProductIds = [
        ...new Set(
          input.confirmedItems
            .map((item) => String(item.product_id ?? '').trim())
            .filter(Boolean)
        ),
      ];

      const prefetched = explicitProductIds.length
        ? await tx.product.findMany({
            where: { id: { in: explicitProductIds } },
            select: { id: true, ...receiptProductSelect },
          })
        : [];

      const productsById = new Map<string, ReceiptProductRow>(
        prefetched.map((row) => [row.id, row])
      );

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
            tx,
            nameCatalog
          );
          productId = ensured.id;
        }

        let product = productsById.get(productId);
        if (!product) {
          const loaded = await tx.product.findUnique({
            where: { id: productId },
            select: { id: true, ...receiptProductSelect },
          });
          if (!loaded) {
            throw new Error(`Product was not found: ${productId}`);
          }
          product = loaded;
          productsById.set(productId, product);
        }

        if (item.case_pack_size && item.case_pack_size > 0) {
          const divisor =
            product.splitFactor && product.splitFactor > 0 ? product.splitFactor : 1;
          const packData = productPackWriteData(item.case_pack_size, divisor);
          product = await tx.product.update({
            where: { id: productId },
            data: packData,
            select: { id: true, ...receiptProductSelect },
          });
          productsById.set(productId, product);
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
          const lineConfidence = computeCommitLineConfidence(
            item,
            productNames.get(productId) ?? product.name
          );
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
              ocrLineConfidence: lineConfidence,
            },
          });
        }
      }

      const committed = {
        invoiceId,
        receipts,
        transactionsCreated: receipts.length,
      };
      if (input.draftId) {
        await tx.invoiceOcrDraft.update({
          where: { id: input.draftId },
          data: {
            consumedAt: new Date(),
            result: committed as unknown as Prisma.InputJsonValue,
          },
        });
      }
      return committed;
    },
    { timeout: 20_000 }
  );

  invalidateInventoryCaches();
  return result;
}
