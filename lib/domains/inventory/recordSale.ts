import { InventoryLocation, TransactionType } from '@prisma/client';
import { getCurrentStock, prisma } from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { consumeLotsFifo } from '@/lib/domains/inventory/lots';
import { multiplyMoney } from '@/lib/utils/money';

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
 */
export async function recordProductSale(input: {
  productId: string;
  quantity: number;
  staffId: string;
  location?: SaleLocation;
  unitPriceOverride?: number;
  referenceId?: string;
}): Promise<RecordSaleResult> {
  const qty = Number(input.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('Sale quantity must be greater than zero.');
  }

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new Error('Product not found.');

  const location = LOC[input.location ?? (product.isManufactured ? 'deli' : 'floor')];
  const available = await getCurrentStock(product.id, location);
  if (available < qty) {
    throw new Error(
      `Insufficient stock at ${location.replace(/_/g, ' ')}: need ${qty}, have ${available}.`
    );
  }

  const unitPrice =
    input.unitPriceOverride && input.unitPriceOverride > 0
      ? input.unitPriceOverride
      : product.retailPrice && product.retailPrice > 0
        ? product.retailPrice
        : product.standardCost && product.standardCost > 0
          ? product.standardCost / (1 - Math.min(0.95, product.targetMargin))
          : 0;

  const tx = await prisma.$transaction(async (db) => {
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
        unitCostAtTime: Number(unitPrice.toFixed(4)),
        referenceId: input.referenceId ?? `SALE-${Date.now()}`,
        notes: `Retail sale (${qty} × $${unitPrice.toFixed(2)})`,
      },
    });
  const tx = await prisma.inventoryTransaction.create({
    data: {
      productId: product.id,
      staffId: input.staffId.trim() || 'staff-pos',
      qtyChange: -Math.abs(qty),
      transactionType: TransactionType.Sale,
      fromLocation: location,
      toLocation: InventoryLocation.Customer_Out,
      unitCostAtTime: Number(unitPrice.toFixed(4)),
      referenceId: input.referenceId ?? `SALE-${Date.now()}`,
      notes: `Retail sale (${qty} × $${unitPrice.toFixed(2)})`,
    },
  });

  invalidateInventoryCaches();

  return {
    transactionId: tx.id,
    productId: product.id,
    productName: product.name,
    quantitySold: qty,
    unitPrice: Number(unitPrice.toFixed(4)),
    grossRevenue: multiplyMoney(unitPrice, qty),
    grossRevenue: Number((qty * unitPrice).toFixed(2)),
    location,
  };
}
