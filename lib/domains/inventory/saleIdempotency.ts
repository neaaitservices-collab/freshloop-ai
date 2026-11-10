import { InventoryLocation, InventoryTransaction, Prisma, TransactionType, UnitType } from '@prisma/client';
import type { BundleSaleExecutionResult, ExplodedComponentDeduction } from '@/lib/domains/inventory/ledger';
import type { RecordSaleResult } from '@/lib/domains/inventory/recordSale';

type RowDb = {
  inventoryTransaction: Prisma.TransactionClient['inventoryTransaction'];
  product: Prisma.TransactionClient['product'];
};

/**
 * Staff and POS keys are separate so a clientMutationId cannot replay a webhook externalRef.
 * The prefix is not a store id. Adding a Store row later does not change an existing key.
 * The key stays on the mutation id. Payload identity is the original ledger rows: product or
 * bundle, quantity, location, and charged unit price. A different payload is a 409.
 */
export function staffSaleIdempotencyKey(clientMutationId: string): string {
  return `sale:staff:${clientMutationId.trim()}`;
}

export function posSaleIdempotencyKey(externalRef: string): string {
  return `sale:pos:${externalRef.trim()}`;
}

export class SalePayloadConflictError extends Error {
  readonly code = 'SALE_PAYLOAD_CONFLICT';
  readonly statusCode = 409;

  constructor() {
    super('This sale id is already in use with a different payload.');
    this.name = 'SalePayloadConflictError';
  }
}

export class SaleReplayUnavailableError extends Error {
  readonly code = 'SALE_REPLAY_UNAVAILABLE';
  readonly statusCode = 503;

  constructor() {
    super('The original sale is not available yet. Retry this request.');
    this.name = 'SaleReplayUnavailableError';
  }
}

function close(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.0001;
}

export function bundleQuantityFromRows(
  transactions: { productId: string; qtyChange: number }[],
  items: { productId: string; quantity: number }[]
): number | null {
  if (items.length === 0 || transactions.length !== items.length) return null;
  const ids = new Set(items.map((item) => item.productId));
  if (transactions.some((row) => !ids.has(row.productId))) return null;
  let derived: number | null = null;
  for (const item of items) {
    if (!(item.quantity > 0)) return null;
    const row = transactions.find((tx) => tx.productId === item.productId);
    if (!row) return null;
    const qty = Math.abs(row.qtyChange) / item.quantity;
    if (!Number.isFinite(qty) || qty <= 0) return null;
    if (derived == null) derived = qty;
    else if (!close(derived, qty)) return null;
  }
  return derived == null ? null : Number(derived.toFixed(4));
}

async function productRow(
  db: RowDb,
  referenceId: string
): Promise<InventoryTransaction | null> {
  return db.inventoryTransaction.findFirst({
    where: { referenceId, transactionType: TransactionType.Sale },
    orderBy: { timestamp: 'asc' },
  });
}

function productMatches(
  row: InventoryTransaction,
  request: { productId: string; quantity: number; location: InventoryLocation; unitPrice: number | null }
): boolean {
  const unitPrice = row.realizedUnitPrice ?? row.unitCostAtTime;
  return (
    row.productId === request.productId &&
    close(Math.abs(row.qtyChange), request.quantity) &&
    row.fromLocation === request.location &&
    (request.unitPrice == null || close(unitPrice, request.unitPrice))
  );
}

async function productResult(
  db: RowDb,
  row: InventoryTransaction
): Promise<RecordSaleResult & { idempotent: true }> {
  const product = await db.product.findUnique({
    where: { id: row.productId },
    select: { name: true },
  });
  const quantitySold = Math.abs(row.qtyChange);
  const unitPrice = row.realizedUnitPrice ?? row.unitCostAtTime;
  return {
    idempotent: true,
    transactionId: row.id,
    productId: row.productId,
    productName: product?.name ?? row.productId,
    quantitySold,
    unitPrice,
    grossRevenue: row.realizedLineRevenue ?? Number((unitPrice * quantitySold).toFixed(2)),
    location: row.fromLocation,
  };
}

/** Key or unique conflict already happened. Match replays, a different payload is 409, no rows is retryable. */
export async function claimProductSaleReplay(
  db: RowDb,
  input: {
    referenceId: string;
    idempotencyKey?: string;
    productId: string;
    quantity: number;
    location: InventoryLocation;
    /** Null when the request omitted a unit price. The stored price is then accepted. */
    unitPrice: number | null;
  }
): Promise<RecordSaleResult & { idempotent: true }> {
  const primary = await productRow(db, input.referenceId);
  const alternate =
    !primary && input.idempotencyKey && input.idempotencyKey !== input.referenceId
      ? await productRow(db, input.idempotencyKey)
      : null;
  const row = primary ?? alternate;
  if (!row) throw new SaleReplayUnavailableError();
  if (!primary || !productMatches(row, input)) throw new SalePayloadConflictError();
  return productResult(db, row);
}

type BundleIdentity = {
  id: string;
  name: string;
  bundleSku: string;
  bundlePrice: number;
  items: { productId: string; quantity: number }[];
};

async function bundleRows(db: RowDb, referenceId: string): Promise<InventoryTransaction[]> {
  return db.inventoryTransaction.findMany({
    where: { referenceId, transactionType: TransactionType.POS_Sale },
    orderBy: { timestamp: 'asc' },
  });
}

async function bundleResult(
  db: RowDb,
  transactions: InventoryTransaction[],
  bundle: BundleIdentity,
  quantitySold: number,
  referenceId: string
): Promise<BundleSaleExecutionResult & { idempotent: true }> {
  const products = await db.product.findMany({
    where: { id: { in: transactions.map((row) => row.productId) } },
    select: { id: true, name: true, unitType: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  const deductions: ExplodedComponentDeduction[] = transactions.map((row) => {
    const product = byId.get(row.productId);
    const qtyDeducted = Math.abs(row.qtyChange);
    const unitCostAtTime = row.unitCostAtTime;
    return {
      productId: row.productId,
      productName: product?.name ?? row.productId,
      unitType: product?.unitType ?? UnitType.UNIT,
      qtyDeducted,
      unitCostAtTime,
      lineCogs: Number((qtyDeducted * unitCostAtTime).toFixed(4)),
      transactionId: row.id,
    };
  });
  const totalExplodedCogs = Number(deductions.reduce((sum, row) => sum + row.lineCogs, 0).toFixed(2));
  const header = transactions.find((row) => row.extendedRevenue != null)?.extendedRevenue;
  const bundleGrossRevenue = header ?? Number((bundle.bundlePrice * quantitySold).toFixed(2));
  const realizedGrossMarginPct =
    bundleGrossRevenue > 0
      ? Number((((bundleGrossRevenue - totalExplodedCogs) / bundleGrossRevenue) * 100).toFixed(2))
      : 0;
  return {
    idempotent: true,
    bundleId: bundle.id,
    bundleName: bundle.name,
    bundleSku: bundle.bundleSku,
    externalRef: referenceId,
    quantitySold,
    bundleGrossRevenue,
    totalExplodedCogs,
    realizedGrossMarginPct,
    deductions,
    transactions,
    executedAt: transactions[0]!.timestamp.toISOString(),
  };
}

export async function claimBundleSaleReplay(
  db: RowDb,
  input: {
    referenceId: string;
    idempotencyKey?: string;
    quantitySold: number;
    bundle: BundleIdentity;
  }
): Promise<BundleSaleExecutionResult & { idempotent: true }> {
  const primary = await bundleRows(db, input.referenceId);
  const alternate =
    primary.length === 0 && input.idempotencyKey && input.idempotencyKey !== input.referenceId
      ? await bundleRows(db, input.idempotencyKey)
      : [];
  const rows = primary.length > 0 ? primary : alternate;
  if (rows.length === 0) throw new SaleReplayUnavailableError();
  const quantitySold = bundleQuantityFromRows(rows, input.bundle.items);
  const samePayload =
    primary.length > 0 && quantitySold != null && close(quantitySold, input.quantitySold);
  if (!samePayload || quantitySold == null) throw new SalePayloadConflictError();
  return bundleResult(db, rows, input.bundle, quantitySold, input.referenceId);
}

export type WebhookExpectedLine =
  | {
      kind: 'product';
      productId: string;
      quantity: number;
      location: InventoryLocation;
      /** Null when the request omitted a price. The stored price is then accepted. */
      unitPrice: number | null;
    }
  | {
      kind: 'bundle';
      bundleSku: string;
      quantity: number;
      items: { productId: string; quantity: number }[];
    };

function bundleNoteMatches(notes: string | null, bundleSku: string, quantity: number): boolean {
  if (!notes) return false;
  return notes.includes(`Explode [${bundleSku}]`) && notes.includes(`(x${quantity})`);
}

/** Empty rows are missing. A different product, bundle, quantity, location, or price is a mismatch. */
export function webhookReplayDecision(
  rows: InventoryTransaction[],
  expected: WebhookExpectedLine[]
): 'match' | 'mismatch' | 'missing' {
  if (rows.length === 0) return 'missing';
  const sales = rows.filter((row) => row.transactionType === TransactionType.Sale);
  const kits = rows.filter((row) => row.transactionType === TransactionType.POS_Sale);
  if (sales.length + kits.length !== rows.length) return 'mismatch';
  const products = expected.filter((line) => line.kind === 'product');
  const bundles = expected.filter((line) => line.kind === 'bundle');
  if (sales.length !== products.length) return 'mismatch';
  const used = new Set<number>();
  for (const line of products) {
    const index = sales.findIndex((row, rowIndex) => {
      if (used.has(rowIndex)) return false;
      const unitPrice = row.realizedUnitPrice ?? row.unitCostAtTime;
      return (
        row.productId === line.productId &&
        close(Math.abs(row.qtyChange), line.quantity) &&
        row.fromLocation === line.location &&
        (line.unitPrice == null || close(unitPrice, line.unitPrice))
      );
    });
    if (index < 0) return 'mismatch';
    used.add(index);
  }
  let cursor = 0;
  for (const line of bundles) {
    const slice = kits.slice(cursor, cursor + line.items.length);
    if (slice.length !== line.items.length) return 'mismatch';
    const quantitySold = bundleQuantityFromRows(slice, line.items);
    const notesMatch = slice.every((row) => bundleNoteMatches(row.notes, line.bundleSku, line.quantity));
    if (!notesMatch || quantitySold == null || !close(quantitySold, line.quantity)) return 'mismatch';
    cursor += line.items.length;
  }
  if (cursor !== kits.length) return 'mismatch';
  return 'match';
}
