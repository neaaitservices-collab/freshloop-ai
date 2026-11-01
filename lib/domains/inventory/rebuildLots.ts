import { InventoryLocation } from '@prisma/client';
import { getCurrentStock, prisma } from '@/lib/domains/inventory/ledger';
import { createLotOnReceive } from '@/lib/domains/inventory/lots';

const LOT_LOCATIONS: InventoryLocation[] = [
  InventoryLocation.Retail_Floor,
  InventoryLocation.Kitchen_Prep,
  InventoryLocation.Deli_Grab_N_Go,
  InventoryLocation.Main_Storage,
];

/**
 * Rebuild lot rows from current ledger balances (one synthetic lot per product/location).
 * Deletes and recreates lots for the requested products only, each product in its own transaction.
 * Pass `allProducts` for a full catalog repair (seed / migration). A call with no scope does nothing.
 */
export async function rebuildLotsFromLedger(options?: {
  productIds?: string[];
  allProducts?: boolean;
}): Promise<{ lotsCreated: number }> {
  const productIds = (options?.productIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (!options?.allProducts && productIds.length === 0) {
    throw new Error('rebuildLotsFromLedger requires productIds or allProducts: true.');
  }

  const products = await prisma.product.findMany({
    where: productIds.length > 0 ? { id: { in: productIds } } : undefined,
    select: { id: true, standardCost: true },
  });
  let lotsCreated = 0;

  for (const product of products) {
    const created = await prisma.$transaction(async (tx) => {
      await tx.inventoryLot.deleteMany({ where: { productId: product.id } });
      let count = 0;
      for (const location of LOT_LOCATIONS) {
        const qty = await getCurrentStock(product.id, location);
        if (!(qty > 0)) continue;
        const latestReceive = await tx.inventoryTransaction.findFirst({
          where: {
            productId: product.id,
            toLocation: location,
            qtyChange: { gt: 0 },
          },
          orderBy: { timestamp: 'desc' },
          select: {
            unitCostAtTime: true,
            expirationDate: true,
            referenceId: true,
            id: true,
          },
        });
        await createLotOnReceive(tx, {
          productId: product.id,
          location,
          qty,
          unitCostAtTime: latestReceive?.unitCostAtTime ?? product.standardCost ?? 0,
          expirationDate: latestReceive?.expirationDate ?? null,
          receiveReferenceId: latestReceive?.referenceId ?? 'LEDGER-REBUILD',
          receiveTransactionId: latestReceive?.id ?? null,
        });
        count += 1;
      }
      return count;
    });
    lotsCreated += created;
  }

  return { lotsCreated };
}
