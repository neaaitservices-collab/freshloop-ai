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
import { getSupplierNameById } from '@/lib/domains/suppliers/suppliers';
import {
  calculateYieldQuote,
  resolveTargetMargin,
  type MarginMode,
  type RetailUnit,
  RETAIL_UNITS,
} from '@/lib/domains/receiving/yieldPricing';
import {
  receivingDepartmentFieldErrors,
  type ReceivingDepartmentFieldError,
} from '@/lib/domains/inventory/receivingDepartment';
import { receivingDepartment } from '@/lib/domains/inventory/receivingDepartment';

export const MAX_RECEIVING_BATCH_SIZE = 80;

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
  const postable = lines.filter((line) => !sampleReceivingRejection(line));
  if (postable.length === 0) return [];
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

export function validateReceivingLogPostInput(body: Partial<ReceivingLogPostInput>): {
  ok: true;
  input: ReceivingLogPostInput;
} | { ok: false; error: string } {
  const itemName = body.itemName?.trim() ?? '';
  const casesReceived = Number(body.casesReceived);
  const caseCost = Number(body.caseCost);
  const packSize = Number(body.packSize);
  const splitFactor = Number(body.splitFactor);
  const currentRetailPrice = Number(body.currentRetailPrice);
  const retailUnit = body.retailUnit as RetailUnit;
  const marginMode: MarginMode =
    body.marginMode === '35' || body.marginMode === '40' || body.marginMode === 'custom'
      ? body.marginMode
      : '40';

  if (!itemName) return { ok: false, error: 'itemName is required.' };
  if (!RETAIL_UNITS.includes(retailUnit)) {
    return { ok: false, error: 'retailUnit must be units, quarts, or lbs.' };
  }
  if (![casesReceived, caseCost, packSize, splitFactor, currentRetailPrice].every(Number.isFinite)) {
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
  db?: LotTx
): Promise<ReceivingLogPostResult> {
  const sampleReason = sampleReceivingRejection(input);
  if (sampleReason) {
    return {
      externalLogId: input.externalLogId,
      itemName: input.itemName,
      stock: { posted: false, reason: sampleReason },
    };
  }
  await assertReceivingDepartmentsChosen([input], supplierName);

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
    const stock = await postReceipt({
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
    }, db);

    return {
      externalLogId: input.externalLogId,
      itemName: input.itemName,
      stock,
    };
  } catch (error) {
    if (error instanceof InventoryLedgerError) throw error;
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
      stock: { posted: false, reason: 'Stock was not updated.' },
    };
  }
}

export interface ReceivingBatchSlot {
  externalLogId?: string;
  itemName: string;
  stock: { posted: boolean; reason?: string; conflict?: boolean };
}

/** Unreadable quantities stay out of the post list so one blank line does not reject the batch. */
export function splitUnreadReceivingLines<T extends { casesReceived?: number; itemName?: string; externalLogId?: string }>(
  rows: T[]
): { unread: ReceivingBatchSlot[]; rest: T[] } {
  const unread: ReceivingBatchSlot[] = [];
  const rest: T[] = [];
  for (const row of rows) {
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
      results[index] = await postReceivingLogToInventory(items[index], actorId, supplierName);
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
