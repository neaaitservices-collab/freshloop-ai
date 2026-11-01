import { InventoryLocation, Prisma } from '@prisma/client';

export type LotTx = Prisma.TransactionClient;

export class LotAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LotAllocationError';
  }
}

/** Synthetic layers sort after real dated lots so expiring product is consumed first. */
const SYNTHETIC_EXPIRATION = new Date(Date.UTC(9999, 11, 31));

export async function lockProductInventory(tx: LotTx, productId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM inventory_lots WHERE product_id = ${productId} FOR UPDATE`;
}

/** Ledger on-hand at a location. Callers must not have written the outflow being planned. */
export async function readLocationOnHand(
  tx: LotTx,
  productId: string,
  location: InventoryLocation
): Promise<number> {
  const aggregation = await tx.inventoryTransaction.aggregate({
    where: {
      productId,
      OR: [
        { toLocation: location, qtyChange: { gt: 0 } },
        { fromLocation: location, qtyChange: { lt: 0 } },
      ],
    },
    _sum: { qtyChange: true },
  });
  return Number((aggregation._sum.qtyChange ?? 0).toFixed(4));
}

async function openLotQty(tx: LotTx, productId: string, location: InventoryLocation): Promise<number> {
  const aggregation = await tx.inventoryLot.aggregate({
    where: { productId, location, qtyRemaining: { gt: 0 } },
    _sum: { qtyRemaining: true },
  });
  return Number((aggregation._sum.qtyRemaining ?? 0).toFixed(4));
}

async function catalogUnitCost(tx: LotTx, productId: string): Promise<number> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { standardCost: true },
  });
  return product?.standardCost ?? 0;
}

/**
 * Make open lot quantity match ledger on-hand at one location.
 * A surplus (missed sales or adjustments) is dropped oldest-first.
 * A shortage is one synthetic lot for the full gap, not only the next sale.
 */
export async function alignLotsToLedger(
  tx: LotTx,
  input: {
    productId: string;
    location: InventoryLocation;
    unitCost?: number;
    receiveReferenceId?: string;
    receiveTransactionId?: string | null;
  }
): Promise<void> {
  await lockProductInventory(tx, input.productId);
  const target = Math.max(0, await readLocationOnHand(tx, input.productId, input.location));
  const covered = await openLotQty(tx, input.productId, input.location);
  const gap = Number((target - covered).toFixed(4));
  if (Math.abs(gap) <= 0.0001) return;

  if (gap > 0) {
    const unitCost = input.unitCost ?? (await catalogUnitCost(tx, input.productId));
    await tx.inventoryLot.create({
      data: {
        productId: input.productId,
        location: input.location,
        qtyRemaining: gap,
        unitCostAtTime: Number(Math.max(0, unitCost).toFixed(4)),
        expirationDate: SYNTHETIC_EXPIRATION,
        receiveReferenceId: input.receiveReferenceId ?? 'LOT-BACKFILL',
        receiveTransactionId: input.receiveTransactionId ?? null,
      },
    });
    return;
  }

  let extra = Math.abs(gap);
  const lots = await tx.inventoryLot.findMany({
    where: {
      productId: input.productId,
      location: input.location,
      qtyRemaining: { gt: 0 },
    },
    orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }],
  });
  for (const lot of lots) {
    if (extra <= 0.0001) break;
    const take = Number(Math.min(lot.qtyRemaining, extra).toFixed(4));
    if (!(take > 0)) continue;
    const updated = await tx.inventoryLot.updateMany({
      where: { id: lot.id, qtyRemaining: { gte: take } },
      data: { qtyRemaining: { decrement: take } },
    });
    if (updated.count !== 1) {
      throw new LotAllocationError(
        `Lot balance changed during alignment at ${input.location.replace(/_/g, ' ')}.`
      );
    }
    extra = Number((extra - take).toFixed(4));
  }
}

export async function createLotOnReceive(
  tx: LotTx,
  input: {
    productId: string;
    location: InventoryLocation;
    qty: number;
    unitCostAtTime: number;
    expirationDate?: Date | null;
    receivedAt?: Date | null;
    receiveReferenceId?: string | null;
    receiveTransactionId?: string | null;
  }
) {
  const qty = Number(Math.abs(input.qty).toFixed(4));
  if (!(qty > 0)) {
    throw new LotAllocationError('Lot quantity must be greater than zero.');
  }
  await lockProductInventory(tx, input.productId);
  return tx.inventoryLot.create({
    data: {
      productId: input.productId,
      location: input.location,
      qtyRemaining: qty,
      unitCostAtTime: Number(input.unitCostAtTime.toFixed(4)),
      expirationDate: input.expirationDate ?? null,
      ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
      receiveReferenceId: input.receiveReferenceId ?? null,
      receiveTransactionId: input.receiveTransactionId ?? null,
    },
  });
}

/**
 * Consume oldest lots first (expiration, then receivedAt).
 * Aligns lot quantity to ledger on-hand first so a partial lot table cannot
 * block stock that is actually on hand, and so extra layers cannot outlive the ledger.
 */
export async function consumeLotsFifo(
  tx: LotTx,
  input: {
    productId: string;
    location: InventoryLocation;
    qty: number;
    /**
     * Consume no more than current on-hand and do not throw when the ledger is short.
     * Used by writers that still post a negative ledger row (bundle explode, manufacturing).
     * Alignment still runs when on-hand is already zero so leftover layers are trimmed.
     */
    allowShort?: boolean;
  }
): Promise<Array<{ lotId: string; qty: number; unitCost: number }>> {
  let need = Number(Math.abs(input.qty).toFixed(4));
  if (!(need > 0)) return [];

  await lockProductInventory(tx, input.productId);
  const onHand = Math.max(0, await readLocationOnHand(tx, input.productId, input.location));
  if (input.allowShort) {
    need = Number(Math.min(need, onHand).toFixed(4));
  } else if (need > onHand + 0.0001) {
    const short = Number((need - onHand).toFixed(4));
    throw new LotAllocationError(
      `Insufficient lot stock at ${input.location.replace(/_/g, ' ')}: short ${short} units.`
    );
  }

  await alignLotsToLedger(tx, {
    productId: input.productId,
    location: input.location,
  });

  if (!(need > 0)) return [];

  const lots = await tx.inventoryLot.findMany({
    where: {
      productId: input.productId,
      location: input.location,
      qtyRemaining: { gt: 0 },
    },
    orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }],
  });

  let remaining = need;
  const allocations: Array<{ lotId: string; qty: number; unitCost: number }> = [];

  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Number(Math.min(lot.qtyRemaining, remaining).toFixed(4));
    if (!(take > 0)) continue;
    const updated = await tx.inventoryLot.updateMany({
      where: { id: lot.id, qtyRemaining: { gte: take } },
      data: { qtyRemaining: { decrement: take } },
    });
    if (updated.count !== 1) {
      throw new LotAllocationError(
        `Lot balance changed during allocation at ${input.location.replace(/_/g, ' ')}.`
      );
    }
    allocations.push({ lotId: lot.id, qty: take, unitCost: lot.unitCostAtTime });
    remaining = Number((remaining - take).toFixed(4));
  }

  if (remaining > 0.0001) {
    throw new LotAllocationError(
      `Insufficient lot stock at ${input.location.replace(/_/g, ' ')}: short ${remaining} units.`
    );
  }

  return allocations;
}

/** Move quantity between locations while preserving FIFO cost layers. */
export async function transferLotsFifo(
  tx: LotTx,
  input: {
    productId: string;
    fromLocation: InventoryLocation;
    toLocation: InventoryLocation;
    qty: number;
    receiveReferenceId?: string;
  }
) {
  const allocations = await consumeLotsFifo(tx, {
    productId: input.productId,
    location: input.fromLocation,
    qty: input.qty,
  });

  for (const alloc of allocations) {
    const source = await tx.inventoryLot.findUniqueOrThrow({ where: { id: alloc.lotId } });
    await createLotOnReceive(tx, {
      productId: input.productId,
      location: input.toLocation,
      qty: alloc.qty,
      unitCostAtTime: alloc.unitCost,
      expirationDate: source.expirationDate,
      receiveReferenceId: input.receiveReferenceId ?? `XFER-${source.id.slice(0, 8)}`,
    });
  }
}
