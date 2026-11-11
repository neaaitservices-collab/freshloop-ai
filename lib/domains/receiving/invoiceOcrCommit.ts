import { Department, InventoryLocation, Prisma } from '@prisma/client';
import { departmentIdColumns } from '@/lib/domains/catalog/departmentRef';
import { loadDepartmentCodeMap } from '@/lib/domains/catalog/departmentRefStore';
import { InventoryLedgerError, prisma } from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { normalizeProductPackFields } from '@/lib/domains/inventory/stock';
import {
  INVOICE_OCR_CONFIDENCE_THRESHOLD,
  computeCommitLineConfidence,
  lineNeedsManualReview,
} from '@/lib/domains/receiving/invoiceOcrConfidence';
import { sampleInvoiceCommitRejection } from '@/lib/domains/receiving/sampleReceivingGuard';
import { canonicalInvoiceDate } from '@/lib/domains/receiving/invoiceDeliveryId';
import {
  assertReceivingDepartmentsChosen,
  postReceivingLogToInventory,
} from '@/lib/domains/receiving/receivingLogPost';
import { getSupplierNameById } from '@/lib/domains/suppliers/suppliers';
import {
  invoiceLinePostInput,
  resolveSupplierInvoice,
  SUPPLIER_REQUIRED_ERROR,
} from '@/lib/domains/receiving/supplierInvoiceIdentity';
import type { ReceivingLogPostResult } from '@/lib/domains/receiving/receivingLogPost';

export type OcrQuantityKind = 'units' | 'cases';

/** Preview lines say `unit: "cases"`. Commit must not treat that quantity as units. */
export function quantityKindForInvoiceUnit(
  unit: string | undefined,
  explicit?: OcrQuantityKind
): OcrQuantityKind {
  if (explicit === 'cases' || explicit === 'units') return explicit;
  const value = (unit ?? '').trim().toLowerCase();
  if (value.includes('case') || value === 'cs' || value === 'ctn') return 'cases';
  return 'units';
}

export type OcrReviewReasonCode =
  | 'low_confidence'
  | 'cost_guardrail'
  | 'department_assumed'
  | 'quantity_unreadable'
  | 'name_unreadable'
  | 'line_total_mismatch'
  | 'cost_unreadable'
  | 'unit_invalid';

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
  department_assumed?: boolean;
  quantity_unreadable?: boolean;
  name_unreadable?: boolean;
  cost_unreadable?: boolean;
  unit_invalid?: boolean;
  line_total_mismatch?: boolean;
  review_reasons?: OcrReviewReasonCode[];
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
  /** Set when a resolution changes the scanned pack or uses a split other than 1. */
  split_factor?: number;
  pack_needs_manager?: boolean;
  /** Receiving clerk who confirmed a pack or split change. */
  pack_edited_by?: string;
  line_confidence: number;
  requires_approval: boolean;
  department_assumed?: boolean;
  quantity_unreadable?: boolean;
  name_unreadable?: boolean;
  cost_unreadable?: boolean;
  unit_invalid?: boolean;
  line_total_mismatch?: boolean;
  line_total_note?: string;
  review_reasons?: OcrReviewReasonCode[];
}

export interface OcrDraftPayload {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  /** A guessed ambiguous date is stored, and posting stays blocked until a clerk confirms it. */
  invoiceDateNeedsConfirm?: boolean;
  /** The note that says which reading was picked and why. */
  invoiceDateConfirmReason?: string;
  totalAmount: number;
  departmentBreakdown: Record<string, number>;
  lines: OcrDraftLine[];
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

  const supplierId = input.invoiceMeta?.supplierId?.trim() ?? '';
  if (!supplierId) throw new InventoryLedgerError(SUPPLIER_REQUIRED_ERROR, 'SUPPLIER_REQUIRED', 409);
  const dateKey = canonicalInvoiceDate(input.invoiceMeta?.invoiceDate);
  if (!dateKey) {
    throw new InventoryLedgerError(
      'The invoice date must be a real calendar date before it can be received.',
      'DATE_REQUIRED',
      409,
      { committed: false }
    );
  }
  const headerAt = new Date(`${dateKey}T00:00:00.000Z`);
  const resolved = await resolveSupplierInvoice({
    supplierId,
    invoiceNumber: input.invoiceMeta?.invoiceNumber ?? '',
    invoiceDate: dateKey,
    lines: input.confirmedItems.map((item) => ({ printedName: item.line_name?.trim() || '' })),
  });
  if (!resolved.ok) {
    throw new InventoryLedgerError(resolved.error, resolved.code, 409, { committed: false, ...resolved.details });
  }
  const posts: Awaited<ReturnType<typeof invoiceLinePostInput>>[] = [];
  for (const [index, item] of input.confirmedItems.entries()) {
    const identity = resolved.lines[index];
    if (!identity) {
      throw new InventoryLedgerError('A saved invoice line was missing.', 'LINE_MISMATCH', 409, { committed: false });
    }
    posts.push(
      await invoiceLinePostInput(
        {
          printedName: item.line_name?.trim() || '',
          productId: item.product_id,
          quantity: item.quantity,
          unitCost: item.unit_cost,
          quantityKind: item.quantity_kind === 'cases' ? 'cases' : 'units',
          casePackSize: item.case_pack_size,
          department: item.department_assumed ? undefined : item.department,
          departmentAssumed: item.department_assumed === true,
        },
        identity.deliveryId,
        supplierId
      )
    );
  }

  const supplierName = await getSupplierNameById(supplierId);
  await assertReceivingDepartmentsChosen(posts, supplierName);

  let result: {
    invoiceId: string | null;
    receipts: { transactionId: string; productId: string; unitsAdded: number; onHand: number }[];
    transactionsCreated: number;
  };
  try {
    result = await prisma.$transaction(
      async (tx) => {
        if (input.draftId) {
          const locked = await tx.$queryRaw<Array<{ consumed_at: Date | null; result: unknown }>>`
            SELECT consumed_at, result FROM invoice_ocr_drafts WHERE id = ${input.draftId} FOR UPDATE
          `;
          const held = locked[0];
          if (held?.consumed_at) {
            const prior = held.result;
            if (prior && typeof prior === 'object' && 'invoiceId' in prior) {
              const stored = prior as {
                invoiceId?: string | null;
                receipts?: { transactionId: string; productId: string; unitsAdded: number; onHand: number }[];
              };
              return {
                invoiceId: stored.invoiceId ?? null,
                receipts: (stored.receipts ?? []).map((row) => ({ ...row, unitsAdded: 0 })),
                transactionsCreated: 0,
              };
            }
            throw new InventoryLedgerError(
              'This scan was already received.',
              'DRAFT_ALREADY_RECEIVED',
              409,
              { committed: false }
            );
          }
        }
        const postedRows: ReceivingLogPostResult[] = [];
        for (const post of posts) {
          const row = await postReceivingLogToInventory(post, input.staffId, supplierName, tx, true);
          if (!row.stock.posted) {
            const rolledBack: ReceivingLogPostResult[] = postedRows.map((earlier) => ({
              externalLogId: earlier.externalLogId,
              itemName: earlier.itemName,
              stock: {
                posted: false,
                reason: 'Rolled back because a later line conflicted. Stock was not added for this line.',
              },
            }));
            rolledBack.push(row);
            throw new InventoryLedgerError(row.stock.reason ?? 'Stock was not updated.', 'DELIVERY_CONFLICT', 409, {
              committed: false,
              results: rolledBack,
            });
          }
          postedRows.push(row);
        }

        const meta = input.invoiceMeta;
        let invoiceId: string | null = null;
        let createdHeader = false;
        if (meta) {
          const existingHeader = await tx.vendorInvoice.findFirst({
            where: { supplierId, invoiceNumber: meta.invoiceNumber, invoiceDate: headerAt },
            select: { id: true },
          });
          if (existingHeader) {
            invoiceId = existingHeader.id;
          } else {
            const invoice = await tx.vendorInvoice.create({
              data: {
                vendorName: meta.vendorName,
                supplierId,
                invoiceNumber: meta.invoiceNumber,
                invoiceDate: headerAt,
                totalAmount: meta.totalAmount,
                departmentBreakdown: meta.departmentBreakdown,
                rawOcrJson: meta.rawOcrJson ?? undefined,
                status: 'RECEIVED',
              },
            });
            invoiceId = invoice.id;
            createdHeader = true;
          }
        }

        const receipts = postedRows.map((row) => ({
          transactionId: row.stock.posted ? row.stock.transactionId : '',
          productId: row.stock.posted ? row.stock.productId : '',
          unitsAdded: row.stock.posted ? row.stock.unitsAdded : 0,
          onHand: row.stock.posted ? row.stock.onHand : 0,
        }));

        if (createdHeader && invoiceId) {
          const departmentIds = await loadDepartmentCodeMap(tx);
          for (const [index, item] of input.confirmedItems.entries()) {
            const productId = receipts[index]?.productId || String(item.product_id ?? '');
            const product = productId
              ? await tx.product.findUnique({
                  where: { id: productId },
                  select: receiptProductSelect,
                })
              : null;
            const packFields = normalizeProductPackFields({
              receivePackSize: product?.receivePackSize,
              splitFactor: product?.splitFactor,
              casePackSize: product?.casePackSize,
            });
            const { units, unitCost } = resolveInvoiceReceipt(item, packFields.casePackSize);
            const lineDepartment = item.department_assumed
              ? product?.department
              : item.department || product?.department;
            if (!lineDepartment) {
              throw new InventoryLedgerError(
                'Pick a department for this new item before receiving it.',
                'DEPARTMENT_REQUIRED',
                400,
                { committed: false }
              );
            }
            await tx.invoiceLineItem.create({
              data: {
                invoiceId,
                name: item.line_name ?? product?.name ?? 'Invoice line',
                department: lineDepartment,
                ...departmentIdColumns(lineDepartment, departmentIds),
                quantity: units > 0 ? units : item.quantity,
                unit: 'units',
                unitCost,
                totalCost: Number((unitCost * (units > 0 ? units : item.quantity)).toFixed(2)),
                casePackSize: packFields.receivePackSize,
                ocrLineConfidence: computeCommitLineConfidence(item, product?.name),
              },
            });
          }
        }

        const committed = {
          invoiceId,
          receipts,
          transactionsCreated: postedRows.filter((row) => row.stock.posted && row.stock.idempotent !== true).length,
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
  } catch (error) {
    if (error instanceof InventoryLedgerError) throw error;
    throw error;
  }

  invalidateInventoryCaches();
  return result;
}
