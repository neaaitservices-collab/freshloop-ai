import { InventoryLocation, Prisma, TransactionType } from '@prisma/client';
import { getCurrentStock, prisma } from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { consumeLotsFifo, lockProductInventory } from '@/lib/domains/inventory/lots';
import { priceProductSale } from '@/lib/domains/inventory/saleRevenue';

export type SaleLocation = 'floor' | 'deli';

const LOC: Record<SaleLocation, InventoryLocation> = {
  floor: InventoryLocation.Retail_Floor,
  deli: InventoryLocation.Deli_Grab_N_Go,
};

export interface RecordSaleResult {
  transactionId: string;
  productId: string;
  productName: string;
  quantitySold: number;
  unitPrice: number;
  grossRevenue: number;
  location: InventoryLocation;
}

/**
 * POS / floor sale — negative qty on ledger for waste KPI denominator (gross sales).
 * Lot consumption and the ledger row commit together.
 */
export async function recordProductSale(input: {
  productId: string;
  quantity: number;
  staffId: string;
  location?: SaleLocation;
  unitPriceOverride?: number;
  referenceId?: string;
  /** Join a caller-owned transaction (POS webhook batch). Caller invalidates caches after commit. */
  db?: Prisma.TransactionClient;
}): Promise<RecordSaleResult> {
  const qty = Number(input.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('Sale quantity must be greater than zero.');
  }

  const client = input.db ?? prisma;
  const product = await client.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new Error('Product not found.');

  const location = LOC[input.location ?? (product.isManufactured ? 'deli' : 'floor')];

  const priced = priceProductSale({
    quantity: qty,
    unitPriceOverride: input.unitPriceOverride,
    retailPrice: product.retailPrice,
    standardCost: product.standardCost,
    targetMargin: product.targetMargin,
  });

  const writeSale = async (db: Prisma.TransactionClient) => {
    await lockProductInventory(db, product.id);
    const available = await getCurrentStock(product.id, location, db);
    if (available + 0.0001 < qty) {
      throw new Error(
        `Insufficient stock at ${location.replace(/_/g, ' ')}: need ${qty}, have ${available}.`
      );
    }
    await consumeLotsFifo(db, {
      productId: product.id,
      location,
      qty,
    });
    return db.inventoryTransaction.create({
      data: {
        productId: product.id,
        staffId: input.staffId.trim() || 'staff-pos',
        qtyChange: -Math.abs(qty),
        transactionType: TransactionType.Sale,
        fromLocation: location,
        toLocation: InventoryLocation.Customer_Out,
        unitCostAtTime: priced.unitPrice,
        realizedUnitPrice: priced.realizedUnitPrice,
        realizedLineRevenue: priced.realizedLineRevenue,
        referenceId: input.referenceId ?? `SALE-${Date.now()}`,
        notes: `Retail sale (${qty} × $${priced.unitPrice.toFixed(2)})`,
      },
    });
  };

  const tx = input.db ? await writeSale(input.db) : await prisma.$transaction(writeSale);

  if (!input.db) invalidateInventoryCaches();

  return {
    transactionId: tx.id,
    productId: product.id,
    productName: product.name,
    quantitySold: qty,
    unitPrice: priced.unitPrice,
    grossRevenue: priced.grossRevenue,
    location,
  };
}
