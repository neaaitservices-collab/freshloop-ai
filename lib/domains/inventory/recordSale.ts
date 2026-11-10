import { InventoryLocation, Prisma, TransactionType } from '@prisma/client';
import { getCurrentStock, prisma } from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { consumeLotsFifo, lockProductInventory } from '@/lib/domains/inventory/lots';
import { isLedgerIdempotencyConflict } from '@/lib/domains/inventory/idempotencyConflict';
import { priceProductSale } from '@/lib/domains/inventory/saleRevenue';
import { claimProductSaleReplay } from '@/lib/domains/inventory/saleIdempotency';

export type SaleLocation = 'floor' | 'deli';

const LOC: Record<SaleLocation, InventoryLocation> = {
  floor: InventoryLocation.Retail_Floor,
  deli: InventoryLocation.Deli_Grab_N_Go,
};

export function resolveSaleLocation(
  product: { isManufactured: boolean },
  location?: SaleLocation
): InventoryLocation {
  return LOC[location ?? (product.isManufactured ? 'deli' : 'floor')];
}

export interface RecordSaleResult {
  transactionId: string;
  productId: string;
  productName: string;
  quantitySold: number;
  unitPrice: number;
  grossRevenue: number;
  location: InventoryLocation;
  idempotent?: boolean;
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
  /** `sale:staff:<clientMutationId>`. Inserted in the same transaction as the sale row. */
  idempotencyKey?: string;
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

  const location = resolveSaleLocation(product, input.location);

  const priced = priceProductSale({
    quantity: qty,
    unitPriceOverride: input.unitPriceOverride,
    retailPrice: product.retailPrice,
    standardCost: product.standardCost,
    targetMargin: product.targetMargin,
  });

  const referenceId = input.referenceId ?? input.idempotencyKey ?? `SALE-${Date.now()}`;

  const claimReplay = () =>
    claimProductSaleReplay(prisma, {
      referenceId,
      idempotencyKey: input.idempotencyKey,
      productId: product.id,
      quantity: qty,
      location,
      unitPrice: input.unitPriceOverride == null ? null : priced.unitPrice,
    });

  if (!input.db && input.idempotencyKey) {
    const prior = await prisma.ledgerIdempotencyKey.findUnique({
      where: { key: input.idempotencyKey },
    });
    if (prior) return claimReplay();
  }

  const writeSale = async (db: Prisma.TransactionClient) => {
    if (input.idempotencyKey) {
      await db.ledgerIdempotencyKey.create({ data: { key: input.idempotencyKey } });
    }
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
        referenceId,
        notes: `Retail sale (${qty} × $${priced.unitPrice.toFixed(2)})`,
      },
    });
  };

  let tx: Awaited<ReturnType<typeof writeSale>>;
  try {
    tx = input.db ? await writeSale(input.db) : await prisma.$transaction(writeSale);
  } catch (error) {
    if (input.idempotencyKey && !input.db && isLedgerIdempotencyConflict(error)) {
      return claimReplay();
    }
    throw error;
  }

  if (!input.db) invalidateInventoryCaches();

  return {
    transactionId: tx.id,
    productId: product.id,
    productName: product.name,
    quantitySold: qty,
    unitPrice: priced.unitPrice,
    grossRevenue: priced.grossRevenue,
    location,
    idempotent: false,
  };
}
