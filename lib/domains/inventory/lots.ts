import { InventoryLocation, Prisma } from '@prisma/client';

export type LotTx = Prisma.TransactionClient;

export class LotAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LotAllocationError';
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
    receiveReferenceId?: string | null;
    receiveTransactionId?: string | null;
  }
) {
  const qty = Number(Math.abs(input.qty).toFixed(4));
  if (!(qty > 0)) {
    throw new LotAllocationError('Lot quantity must be greater than zero.');
  }
  return tx.inventoryLot.create({
    data: {
      productId: input.productId,
      location: input.location,
      qtyRemaining: qty,
      unitCostAtTime: Number(input.unitCostAtTime.toFixed(4)),
      expirationDate: input.expirationDate ?? null,
      receiveReferenceId: input.receiveReferenceId ?? null,
      receiveTransactionId: input.receiveTransactionId ?? null,
    },
  });
}

/** Consume oldest lots first (expiration, then receivedAt). */
export async function consumeLotsFifo(
  tx: LotTx,
  input: {
    productId: string;
    location: InventoryLocation;
    qty: number;
  }
): Promise<Array<{ lotId: string; qty: number; unitCost: number }>> {
  const need = Number(Math.abs(input.qty).toFixed(4));
  if (!(need > 0)) return [];

  let lots = await tx.inventoryLot.findMany({
    where: {
      productId: input.productId,
      location: input.location,
      qtyRemaining: { gt: 0 },
    },
    orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }],
  });

  if (lots.length === 0) {
    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: { standardCost: true },
    });
    await createLotOnReceive(tx, {
      productId: input.productId,
      location: input.location,
      qty: need,
      unitCostAtTime: product?.standardCost ?? 0,
      receiveReferenceId: 'LOT-BACKFILL',
    });
    lots = await tx.inventoryLot.findMany({
      where: {
        productId: input.productId,
        location: input.location,
        qtyRemaining: { gt: 0 },
      },
      orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }],
    });
  }

  let remaining = need;
  const allocations: Array<{ lotId: string; qty: number; unitCost: number }> = [];

  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Number(Math.min(lot.qtyRemaining, remaining).toFixed(4));
    if (!(take > 0)) continue;
    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: { qtyRemaining: { decrement: take } },
    });
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
