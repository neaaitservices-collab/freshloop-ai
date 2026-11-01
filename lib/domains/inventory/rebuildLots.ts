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
 * Run after seed or migration so FIFO consumers align with on-hand totals.
 */
export async function rebuildLotsFromLedger(): Promise<{ lotsCreated: number }> {
  await prisma.inventoryLot.deleteMany({});
  const products = await prisma.product.findMany({ select: { id: true, standardCost: true } });
  let lotsCreated = 0;

  for (const product of products) {
    for (const location of LOT_LOCATIONS) {
      const qty = await getCurrentStock(product.id, location);
      if (!(qty > 0)) continue;
      const latestReceive = await prisma.inventoryTransaction.findFirst({
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
      await createLotOnReceive(prisma, {
        productId: product.id,
        location,
        qty,
        unitCostAtTime: latestReceive?.unitCostAtTime ?? product.standardCost ?? 0,
        expirationDate: latestReceive?.expirationDate ?? null,
        receiveReferenceId: latestReceive?.referenceId ?? 'LEDGER-REBUILD',
        receiveTransactionId: latestReceive?.id ?? null,
      });
      lotsCreated += 1;
    }
  }

  return { lotsCreated };
}
