import { postReceipt, type PostedReceipt, type SkippedReceipt } from '@/lib/domains/inventory/stock';
import { sampleReceivingRejection } from '@/lib/domains/receiving/sampleReceivingGuard';
import { getSupplierNameById } from '@/lib/domains/suppliers/suppliers';
import {
  calculateYieldQuote,
  resolveTargetMargin,
  type MarginMode,
  type RetailUnit,
  RETAIL_UNITS,
} from '@/lib/domains/receiving/yieldPricing';

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
  /** Client log id (invoice line) for batch result mapping. */
  externalLogId?: string;
}

export interface ReceivingLogPostResult {
  externalLogId?: string;
  itemName: string;
  stock: PostedReceipt | SkippedReceipt;
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
      externalLogId: body.externalLogId,
    },
  };
}

export async function postReceivingLogToInventory(
  input: ReceivingLogPostInput,
  actorId: string,
  supplierName: string | null
): Promise<ReceivingLogPostResult> {
  const sampleReason = sampleReceivingRejection(input);
  if (sampleReason) {
    return {
      externalLogId: input.externalLogId,
      itemName: input.itemName,
      stock: { posted: false, reason: sampleReason },
    };
  }

  const targetMargin = resolveTargetMargin(input.marginMode, input.customMarginPercent ?? 0);
  const caseRetailPrice = parseCaseRetail(input.caseRetailPrice);

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
      externalLogId: input.externalLogId,
    });

    return {
      externalLogId: input.externalLogId,
      itemName: input.itemName,
      stock,
    };
  } catch (error) {
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
  stock: { posted: boolean; reason?: string };
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
