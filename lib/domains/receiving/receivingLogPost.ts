import {
  postReceipt,
  type ConflictReceipt,
  type PostedReceipt,
  type SkippedReceipt,
} from '@/lib/domains/inventory/stock';
import { getCurrentStock, InventoryLedgerError, prisma } from '@/lib/domains/inventory/ledger';
import type { LotTx } from '@/lib/domains/inventory/lots';
import {
  DELIVERY_UUID_REQUIRED_ERROR,
  isLegacyScanDeliveryId,
  isRetiredPositionalDeliveryId,
  LEGACY_SCAN_STASH_ERROR,
  normalizeDeliveryUuid,
  ReceivingDeliveryConflict,
  receivingDeliveryPayloadHash,
  RETIRED_POSITIONAL_DELIVERY_ERROR,
} from '@/lib/domains/receiving/deliveryIdentity';
import { sampleReceivingRejection } from '@/lib/domains/receiving/sampleReceivingGuard';
import { normalizeSupplierCode } from '@/lib/domains/receiving/supplierProductMatch';
import { getSupplierNameById } from '@/lib/domains/suppliers/suppliers';
import { Prisma } from '@prisma/client';
import { z, ZodError } from 'zod';
import { numericInput } from '@/lib/security/numericInput';
import {
  calculateYieldQuote,
  resolveTargetMargin,
  type MarginMode,
  type RetailUnit,
  RETAIL_UNITS,
} from '@/lib/domains/receiving/yieldPricing';
import {
  receivingDepartment,
  receivingDepartmentFieldErrors,
  resolveReceivingDepartment,
  type ReceivingDepartmentFieldError,
} from '@/lib/domains/inventory/receivingDepartment';

export const MAX_RECEIVING_BATCH_SIZE = 80;

export const STOCK_NOT_UPDATED = 'Stock was not updated.';
export const RECEIPT_TIMEOUT_REASON =
  'The receipt did not finish in time, so stock was not changed. Try confirming again.';
export const RECEIPT_COLLISION_REASON =
  'Another confirm saved this line at the same time. Nothing was posted. Confirm again.';
export const UNMATCHED_PRODUCT_REASON = 'This line is not matched to a catalog product.';
export const MISSING_LOCATION_REASON = 'A stock location is missing for this receipt.';
export const RECEIVING_VALIDATION_REASON = 'A receiving field failed validation.';
/** A read $0 line stays on the invoice for review and never becomes a stock receipt. */
export const ZERO_DOLLAR_REVIEW_REASON =
  'This $0 line is for review only and was not posted to stock.';

/** Explicit numeric zero. A blank cost stays a validation error. */
export function isZeroDollarReceivingLine(line: { caseCost?: unknown }): boolean {
  return typeof line.caseCost === 'number' && Number.isFinite(line.caseCost) && line.caseCost === 0;
}

const NON_STOCK_SUPPLIER_CODES = new Set(['FUEL', 'XCALL']);

/** Fuel surcharges and comment rows are not stock, even when a price is printed. */
export function isNonStockInvoiceLine(line: {
  supplierCode?: string | null;
  itemName?: string | null;
}): boolean {
  const code = normalizeSupplierCode(line.supplierCode);
  if (code && NON_STOCK_SUPPLIER_CODES.has(code)) return true;
  const name = (line.itemName ?? '').trim().toLowerCase();
  return name === 'fuel surcharge' || name === 'see comment line';
}

/** $0 rows and non-stock charges stay off the ledger. */
export function isSkippedInvoiceReceipt(line: {
  caseCost?: unknown;
  supplierCode?: string | null;
  itemName?: string | null;
}): boolean {
  return isZeroDollarReceivingLine(line) || isNonStockInvoiceLine(line);
}

function looksLikeInternalDetail(message: string): boolean {
  return (
    message.length > 180 ||
    /[\r\n]/.test(message) ||
    /prisma|invocation|\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|constraint|violates|postgres|\bsql\b|\bP\d{4}\b|clientVersion|stack trace|\bat\s+\S+\.(?:ts|js)/i.test(
      message
    )
  );
}

function prismaLabels(error: { message?: string; meta?: unknown }): string {
  const meta =
    error.meta && typeof error.meta === 'object' ? (error.meta as Record<string, unknown>) : {};
  return [error.message, meta.field_name, meta.constraint, meta.modelName, meta.cause, meta.target]
    .filter((part) => part != null)
    .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
    .join(' ');
}

function mentionsProduct(text: string): boolean {
  return /product/i.test(text);
}

function mentionsLocation(text: string): boolean {
  return /location/i.test(text);
}

/**
 * Client copy for a failed receipt. Server logs keep the original error.
 * Stack traces, SQL, and Prisma codes stay off the response.
 */
export function receivingPostFailureReason(error: unknown): string {
  if (error instanceof InventoryLedgerError) {
    const message = error.message.trim();
    return message && !looksLikeInternalDetail(message) ? message : STOCK_NOT_UPDATED;
  }
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    if (!issue) return RECEIVING_VALIDATION_REASON;
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    const message = `${path}${issue.message}`.trim();
    return message && !looksLikeInternalDetail(message) ? message : RECEIVING_VALIDATION_REASON;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const labels = prismaLabels(error);
    if (error.code === 'P2003' || error.code === 'P2025') {
      if (mentionsProduct(labels)) return UNMATCHED_PRODUCT_REASON;
      if (mentionsLocation(labels)) return MISSING_LOCATION_REASON;
      return STOCK_NOT_UPDATED;
    }
    if (error.code === 'P2002') return 'This delivery is already recorded.';
    if (error.code === 'P2028') return RECEIPT_TIMEOUT_REASON;
    return STOCK_NOT_UPDATED;
  }
  if (
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientInitializationError
  ) {
    const labels = error.message;
    if (mentionsLocation(labels)) return MISSING_LOCATION_REASON;
    if (mentionsProduct(labels)) return UNMATCHED_PRODUCT_REASON;
    if (error instanceof Prisma.PrismaClientValidationError) return RECEIVING_VALIDATION_REASON;
    return STOCK_NOT_UPDATED;
  }
  if (error instanceof Error) {
    const message = error.message.trim();
    if (!message || looksLikeInternalDetail(message)) return STOCK_NOT_UPDATED;
    if (mentionsProduct(message) && /not found|not matched|unmatched|no matching|unknown/i.test(message)) {
      return UNMATCHED_PRODUCT_REASON;
    }
    if (mentionsLocation(message) && /missing|not found|invalid|required/i.test(message)) {
      return MISSING_LOCATION_REASON;
    }
    if (/required|must be|greater than|at most|finite|validation/i.test(message)) return message;
    if (/invalid/i.test(message)) return RECEIVING_VALIDATION_REASON;
  }
  return STOCK_NOT_UPDATED;
}

export interface ReceivingLogPostInput {
  itemName: string;
  productId?: string;
  casesReceived: number;
  caseCost: number;
  packSize: number;
  splitFactor: number;
  retailUnit: RetailUnit;
  marginMode: MarginMode;
  customMarginPercent?: number;
  currentRetailPrice: number;
  caseRetailPrice?: number | null;
  supplierId?: string;
  /** Invoice-line department. Ignored when departmentAssumed is set. */
  department?: string;
  departmentAssumed?: boolean;
  category?: string;
  /** Receive-screen department, used only when the line cannot be classified. */
  screenDepartment?: string;
  /** Printed supplier item code. New catalog rows use this as the SKU. */
  supplierCode?: string;
  /** Client log id (invoice line) for batch result mapping. */
  externalLogId?: string;
}

export interface ReceivingLogPostResult {
  externalLogId?: string;
  itemName: string;
  stock: PostedReceipt | SkippedReceipt | ConflictReceipt;
}

export function receivingValidationHttpStatus(error: string): 400 | 409 {
  if (error === RETIRED_POSITIONAL_DELIVERY_ERROR || error === LEGACY_SCAN_STASH_ERROR) {
    return 409;
  }
  return 400;
}

export function receivingLineHttpStatus(
  stock: PostedReceipt | SkippedReceipt | ConflictReceipt
): 200 | 409 {
  return stock.posted === false && stock.conflict === true ? 409 : 200;
}

function optionalDepartment(
  value: string | undefined,
  label: string
): { ok: true; value?: string } | { ok: false; error: string } {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return { ok: true };
  if (!receivingDepartment(trimmed)) {
    return { ok: false, error: `${label} must be a store department.` };
  }
  return { ok: true, value: trimmed.toUpperCase() };
}

export function departmentRequiredBody(gaps: ReceivingDepartmentFieldError[]) {
  return {
    success: false as const,
    error: gaps[0]?.message ?? 'Pick a department before this receipt can be saved.',
    field: 'department' as const,
    fieldErrors: gaps,
  };
}

/** Catalog lookup, then the lines that still have no department. No stock is written. */
export async function receivingDepartmentGaps(
  lines: ReceivingLogPostInput[],
  supplierName: string | null
): Promise<ReceivingDepartmentFieldError[]> {
  const postable = lines.filter(
    (line) => !sampleReceivingRejection(line) && !isZeroDollarReceivingLine(line)
  );
  if (postable.length === 0) return [];
  const needsCatalog = postable.some(
    (line) =>
      resolveReceivingDepartment({
        itemName: line.itemName,
        explicitDepartment: line.department,
        departmentAssumed: line.departmentAssumed,
        supplier: supplierName,
        category: line.category,
        screenDepartment: line.screenDepartment,
      }) === null
  );
  if (!needsCatalog) return [];
  const catalog = await prisma.product.findMany({
    where: { isManufactured: false },
    select: { id: true, name: true },
  });
  return receivingDepartmentFieldErrors(
    postable.map((line) => ({
      itemName: line.itemName,
      productId: line.productId,
      explicitDepartment: line.department,
      departmentAssumed: line.departmentAssumed,
      supplier: supplierName,
      category: line.category,
      screenDepartment: line.screenDepartment,
      externalLogId: line.externalLogId,
    })),
    catalog
  );
}

export async function assertReceivingDepartmentsChosen(
  lines: ReceivingLogPostInput[],
  supplierName: string | null
): Promise<void> {
  const gaps = await receivingDepartmentGaps(lines, supplierName);
  if (gaps.length === 0) return;
  throw new InventoryLedgerError(gaps[0].message, 'DEPARTMENT_REQUIRED', 400, departmentRequiredBody(gaps));
}

function parseCaseRetail(raw: number | null | undefined): number | undefined {
  if (raw === undefined || raw === null || !(Number(raw) > 0)) return undefined;
  return Number(raw);
}

const caseCostSchema = numericInput(z.number().finite().min(0).max(1_000_000));
const currentRetailPriceSchema = numericInput(z.number().finite());
const finiteNumberSchema = numericInput(z.number().finite());

function blankMoney(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

/** Blank case cost or retail price is a validation error, never a stored 0. */
export function receivingCaseCostAndRetailError(body: {
  caseCost?: unknown;
  currentRetailPrice?: unknown;
}): string | null {
  if (blankMoney(body.caseCost)) return 'Case cost is required.';
  if (!finiteNumberSchema.safeParse(body.caseCost).success) {
    return 'Receiving and pricing numbers must be finite.';
  }
  if (!caseCostSchema.safeParse(body.caseCost).success) {
    return 'Case cost must be zero or greater and at most 1,000,000.';
  }
  if (blankMoney(body.currentRetailPrice)) return 'Retail price is required.';
  if (!currentRetailPriceSchema.safeParse(body.currentRetailPrice).success) {
    return 'Receiving and pricing numbers must be finite.';
  }
  return null;
}

export function validateReceivingLogPostInput(
  body: Omit<Partial<ReceivingLogPostInput>, 'caseCost' | 'currentRetailPrice'> & {
    caseCost?: unknown;
    currentRetailPrice?: unknown;
  }
): {
  ok: true;
  input: ReceivingLogPostInput;
} | { ok: false; error: string } {
  const moneyError = receivingCaseCostAndRetailError(body);
  if (moneyError) return { ok: false, error: moneyError };
  const itemName = body.itemName?.trim() ?? '';
  const casesReceived = Number(body.casesReceived);
  const caseCost = caseCostSchema.parse(body.caseCost);
  const packSize = Number(body.packSize);
  const splitFactor = Number(body.splitFactor);
  const currentRetailPrice = currentRetailPriceSchema.parse(body.currentRetailPrice);
  const retailUnit = body.retailUnit as RetailUnit;
  const marginMode: MarginMode =
    body.marginMode === '35' || body.marginMode === '40' || body.marginMode === 'custom'
      ? body.marginMode
      : '40';

  if (!itemName) return { ok: false, error: 'itemName is required.' };
  if (!RETAIL_UNITS.includes(retailUnit)) {
    return { ok: false, error: 'retailUnit must be units, quarts, or lbs.' };
  }
  if (![casesReceived, packSize, splitFactor].every(Number.isFinite)) {
    return { ok: false, error: 'Receiving and pricing numbers must be finite.' };
  }
  if (packSize <= 0 || splitFactor <= 0 || packSize > 1_000_000 || splitFactor > 1_000_000) {
    return { ok: false, error: 'Pack size and split factor must be greater than 0 and at most 1,000,000.' };
  }
  if (!(casesReceived > 0) || casesReceived > 1_000_000) {
    return {
      ok: false,
      error: 'Cases received must be greater than 0 and at most 1,000,000, the same cap as an invoice line.',
    };
  }
  if (caseCost < 0 || caseCost > 1_000_000) {
    return { ok: false, error: 'Case cost must be zero or greater and at most 1,000,000.' };
  }
  const rawDeliveryId = body.externalLogId?.trim() ?? '';
  if (!rawDeliveryId) return { ok: false, error: DELIVERY_UUID_REQUIRED_ERROR };
  const sampleReason = sampleReceivingRejection({ externalLogId: rawDeliveryId });
  if (sampleReason) {
    return {
      ok: true,
      input: {
        itemName,
        productId: body.productId?.trim() || undefined,
        casesReceived,
        caseCost,
        packSize,
        splitFactor,
        retailUnit,
        marginMode,
        customMarginPercent: Number(body.customMarginPercent) || 0,
        currentRetailPrice,
        caseRetailPrice: body.caseRetailPrice,
        supplierId: body.supplierId?.trim() || undefined,
        externalLogId: rawDeliveryId,
      },
    };
  }
  if (isRetiredPositionalDeliveryId(rawDeliveryId)) {
    return { ok: false, error: RETIRED_POSITIONAL_DELIVERY_ERROR };
  }
  if (isLegacyScanDeliveryId(rawDeliveryId)) {
    return { ok: false, error: LEGACY_SCAN_STASH_ERROR };
  }
  const deliveryId = normalizeDeliveryUuid(rawDeliveryId);
  if (!deliveryId) return { ok: false, error: DELIVERY_UUID_REQUIRED_ERROR };
  const department = optionalDepartment(body.department, 'department');
  if (!department.ok) return department;
  const screenDepartment = optionalDepartment(body.screenDepartment, 'screenDepartment');
  if (!screenDepartment.ok) return screenDepartment;
  const category = body.category?.trim() || undefined;

  return {
    ok: true,
    input: {
      itemName,
      productId: body.productId?.trim() || undefined,
      casesReceived,
      caseCost,
      packSize,
      splitFactor,
      retailUnit,
      marginMode,
      customMarginPercent: Number(body.customMarginPercent) || 0,
      currentRetailPrice,
      caseRetailPrice: body.caseRetailPrice,
      supplierId: body.supplierId?.trim() || undefined,
      ...(department.value ? { department: department.value } : {}),
      ...(body.departmentAssumed === true ? { departmentAssumed: true } : {}),
      ...(category ? { category } : {}),
      ...(screenDepartment.value ? { screenDepartment: screenDepartment.value } : {}),
      externalLogId: deliveryId,
    },
  };
}

export async function postReceivingLogToInventory(
  input: ReceivingLogPostInput,
  actorId: string,
  supplierName: string | null,
  db?: LotTx,
  /** Set after the batch already loaded the catalogue and checked every line. */
  departmentChecked = false,
  /** Shared across one invoice so two new lines with the same name create one product. */
  nameCatalog?: { id: string; name: string }[]
): Promise<ReceivingLogPostResult> {
  const sampleReason = sampleReceivingRejection(input);
  if (sampleReason) {
    return {
      externalLogId: input.externalLogId,
      itemName: input.itemName,
      stock: { posted: false, reason: sampleReason },
    };
  }
  if (isZeroDollarReceivingLine(input)) {
    return {
      externalLogId: input.externalLogId,
      itemName: input.itemName,
      stock: { posted: false, reason: ZERO_DOLLAR_REVIEW_REASON },
    };
  }
  if (!departmentChecked) {
    await assertReceivingDepartmentsChosen([input], supplierName);
  }

  const targetMargin = resolveTargetMargin(input.marginMode, input.customMarginPercent ?? 0);
  const caseRetailPrice = parseCaseRetail(input.caseRetailPrice);

  const deliveryId = normalizeDeliveryUuid(input.externalLogId ?? '');
  if (deliveryId) {
    const held = await (db ?? prisma).supplierInvoiceLine.findUnique({
      where: { id: deliveryId },
      select: { heldByLegacy: true },
    });
    if (held?.heldByLegacy) {
      const productId = input.productId?.trim() || '';
      return {
        externalLogId: input.externalLogId,
        itemName: input.itemName,
        stock: {
          posted: true,
          idempotent: true,
          unitsAdded: 0,
          onHand: productId ? await getCurrentStock(productId) : 0,
          productId,
          productName: input.itemName,
          transactionId: '',
          reason: 'This invoice was already received before the upgrade. Stock was not added again.',
        },
      };
    }
  }

  try {
    const stock = await postReceipt(
      {
        itemName: input.itemName,
        productId: input.productId,
        casesReceived: input.casesReceived,
        caseCost: input.caseCost,
        packSize: input.packSize,
        splitFactor: input.splitFactor,
        retailPrice: input.currentRetailPrice,
        ...(caseRetailPrice !== undefined ? { caseRetailPrice } : {}),
        retailUnit: input.retailUnit,
        staffId: actorId,
        targetMargin,
        supplier: supplierName,
        department: input.department,
        departmentAssumed: input.departmentAssumed,
        category: input.category,
        screenDepartment: input.screenDepartment,
        externalLogId: input.externalLogId,
        delivery: input.externalLogId
          ? {
              payloadHash: receivingDeliveryPayloadHash({
                itemName: input.itemName,
                productId: input.productId,
                casesReceived: input.casesReceived,
                caseCost: input.caseCost,
                packSize: input.packSize,
                splitFactor: input.splitFactor,
              }),
              productId: input.productId,
            }
          : undefined,
      },
      db,
      nameCatalog
    );

    return {
      externalLogId: input.externalLogId,
      itemName: input.itemName,
      stock,
    };
  } catch (error) {
    if (error instanceof InventoryLedgerError && error.code === 'DEPARTMENT_REQUIRED') throw error;
    if (error instanceof ReceivingDeliveryConflict) {
      return {
        externalLogId: input.externalLogId,
        itemName: input.itemName,
        stock: { posted: false, conflict: true, reason: error.message },
      };
    }
    console.error('[postReceivingLogToInventory]', input.itemName, error);
    return {
      externalLogId: input.externalLogId,
      itemName: input.itemName,
      stock: { posted: false, reason: receivingPostFailureReason(error) },
    };
  }
}

export interface ReceivingBatchSlot {
  externalLogId?: string;
  itemName: string;
  stock: { posted: boolean; reason?: string; conflict?: boolean };
}

/** Unreadable quantities stay out of the post list so one blank line does not reject the batch. */
export function splitUnreadReceivingLines<
  T extends { casesReceived?: number; caseCost?: unknown; itemName?: string; externalLogId?: string }
>(rows: T[]): { unread: ReceivingBatchSlot[]; rest: T[] } {
  const unread: ReceivingBatchSlot[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    if (isZeroDollarReceivingLine(row)) {
      unread.push({
        externalLogId: row.externalLogId,
        itemName: row.itemName?.trim() || 'Line',
        stock: { posted: false, reason: ZERO_DOLLAR_REVIEW_REASON },
      });
      continue;
    }
    if (Number(row.casesReceived) > 0) {
      rest.push(row);
      continue;
    }
    unread.push({
      externalLogId: row.externalLogId,
      itemName: row.itemName?.trim() || 'Line',
      stock: { posted: false, reason: 'Quantity was not read, so this line was not posted.' },
    });
  }
  return { unread, rest };
}

/**
 * Keep sample rows in their request positions and queue only postable lines.
 * Filling `results[postIndexes[i]]` with the i-th post preserves order.
 */
export function arrangeReceivingBatch(items: ReceivingLogPostInput[]): {
  toPost: ReceivingLogPostInput[];
  results: ReceivingBatchSlot[];
  postIndexes: number[];
} {
  const toPost: ReceivingLogPostInput[] = [];
  const results: ReceivingBatchSlot[] = [];
  const postIndexes: number[] = [];
  for (const input of items) {
    const sampleReason = sampleReceivingRejection(input);
    if (sampleReason) {
      results.push({
        externalLogId: input.externalLogId,
        itemName: input.itemName,
        stock: { posted: false, reason: sampleReason },
      });
      continue;
    }
    postIndexes.push(results.length);
    results.push({
      externalLogId: input.externalLogId,
      itemName: input.itemName,
      stock: { posted: false, reason: 'Stock was not updated.' },
    });
    toPost.push(input);
  }
  return { toPost, results, postIndexes };
}

/** Resolve supplier once, post many lines in parallel (bounded concurrency). */
export async function postReceivingLogBatch(
  items: ReceivingLogPostInput[],
  actorId: string,
  concurrency = 8
): Promise<ReceivingLogPostResult[]> {
  const supplierId = items.find((i) => i.supplierId)?.supplierId;
  const supplierName = supplierId ? await getSupplierNameById(supplierId) : null;
  await assertReceivingDepartmentsChosen(items, supplierName);

  const results: ReceivingLogPostResult[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await postReceivingLogToInventory(
        items[index],
        actorId,
        supplierName,
        undefined,
        true
      );
    }
  }

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/** For session saved-pack preview (single post). */
export function buildSavedPackRecord(input: ReceivingLogPostInput) {
  const targetMargin = resolveTargetMargin(input.marginMode, input.customMarginPercent ?? 0);
  const quote = calculateYieldQuote({
    caseCost: input.caseCost,
    packSize: input.packSize,
    splitFactor: input.splitFactor,
    targetMargin,
    currentRetailPrice: input.currentRetailPrice,
  });
  return {
    id: `pack-${Date.now()}`,
    itemName: input.itemName,
    casesReceived: input.casesReceived,
    caseCost: input.caseCost,
    packSize: input.packSize,
    splitFactor: input.splitFactor,
    retailUnit: input.retailUnit,
    targetMargin,
    totalRetailUnits: quote.totalRetailUnits,
    unitCost: quote.unitCost,
    targetSrp: quote.targetSrp,
    currentRetailPrice: input.currentRetailPrice,
    currentMarginPct: quote.currentMarginPct,
    savedAt: new Date().toISOString(),
  };
}
