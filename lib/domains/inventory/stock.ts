import { Department, InventoryLocation, Prisma, TransactionType, UnitType } from '@prisma/client';
import { parsePosSalesDaysParam, posSalesWindowStart } from '@/lib/domains/inventory/posSalesUnits';
import { getCurrentStock, prisma, VOLUMETRIC_SCRAP_REF_PREFIX } from '@/lib/domains/inventory/ledger';
import { rememberLedgerRead } from '@/lib/domains/inventory/ledgerCache';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { DEFAULT_PAR_CASES, normalizeParCases, stockFromPar } from '@/lib/domains/inventory/parLevel';
import {
  ensureProductMarkdownColumn,
  readProductRetailPrices,
  writeProductMarkdownPrices,
} from '@/lib/domains/inventory/productMarkdownColumn';
import {
  alignLotsToLedger,
  consumeLotsFifo,
  createLotOnReceive,
  transferLotsFifo,
  type LotTx,
} from '@/lib/domains/inventory/lots';
import { markdownRevenueImpact } from '@/lib/utils/money';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';
import {
  buildVolumetricScrapNotes,
  serializeVolumetricScrapNotes,
} from '@/lib/domains/inventory/volumetricScrapLedger';
import { departmentLabel } from '@/lib/domains/inventory/inventoryCatalog';

export const PAR_CASES = DEFAULT_PAR_CASES;

/** Lot alignment + FIFO can exceed Prisma's default 5s interactive tx timeout on remote DBs. */
const LEDGER_WRITE_TX = { maxWait: 15_000, timeout: 30_000 } as const;

export interface StockLevel {
  productId: string;
  name: string;
  supplier: string;
  department: string;
  /** Display category (aligned with department for catalog filters). */
  category: string;
  productType: string;
  origin: string | null;
  unitType: string;
  casePackSize: number;
  unitCost: number;
  /** Shopper-facing units: `Retail_Floor` plus `Deli_Grab_N_Go`. */
  onHand: number;
  kitchenPrepQty: number;
  parUnits: number;
  onHandCases: number;
  parCases: number;
  orderCases: number;
  orderCost: number;
  low: boolean;
  retailPrice: number | null;
  regularRetailPrice: number | null;
  isMarkdown: boolean;
  markdownPct?: number | null;
  daysRemaining: number;
  /** Read-only: units sold in the POS lookback window (Sale + POS_Sale). */
  posSoldInWindow?: number;
  posSalesDays?: number;
}

export interface PostedReceipt {
  posted: true;
  productId: string;
  productName: string;
  unitsAdded: number;
  onHand: number;
  transactionId: string;
}

export interface SkippedReceipt {
  posted: false;
  reason: string;
}

import { matchProduct } from '@/lib/domains/inventory/productMatching';

export { matchProduct };

/** Match by name or insert a purchasable SKU (invoice receive, OCR commit). */
export async function findOrCreatePurchaseProduct(
  input: {
    itemName: string;
    department?: Department;
    supplier?: string | null;
    casePackSize?: number;
    unitCost?: number;
    retailUnit?: string;
  },
  db?: LotTx
): Promise<{ id: string; name: string; created: boolean }> {
  const client = db ?? prisma;
  const name = input.itemName.trim();
  if (!name) throw new Error('Item name is required to add a catalog product.');

  const products = await client.product.findMany({
    where: { isManufactured: false },
    select: { id: true, name: true },
  });
  const match = matchProduct(name, products);
  if (match) {
    await client.product.update({
      where: { id: match.id },
      data: { catalogActive: true },
    });
    return { id: match.id, name: match.name, created: false };
  }

  const pack = packSizeOf(input.casePackSize);
  const unitCost = input.unitCost && input.unitCost > 0 ? Number(input.unitCost.toFixed(4)) : null;
  const created = await client.product.create({
    data: {
      name,
      department: input.department ?? departmentFor(name),
      unitType: unitTypeFor(input.retailUnit ?? 'units'),
      casePackSize: pack,
      standardCost: unitCost,
      supplier: input.supplier?.trim() || null,
      shelfLifeDays: 7,
      isManufactured: false,
    },
    select: { id: true, name: true },
  });
  return { id: created.id, name: created.name, created: true };
}

function packSizeOf(value: number | null | undefined): number {
  return value && value > 0 ? value : 1;
}

/**
 * How a case-count override moves shopper-facing stock.
 * Adds land on the retail floor. Shrink comes off the floor first, then deli.
 * Kitchen prep is left alone.
 */
export function planShelfAdjustment(input: {
  targetUnits: number;
  floorOnHand: number;
  deliOnHand: number;
}): { floorDelta: number; deliDelta: number } {
  const floor = Number(input.floorOnHand.toFixed(4));
  const deli = Number(input.deliOnHand.toFixed(4));
  const target = Number(input.targetUnits.toFixed(4));
  const delta = Number((target - (floor + deli)).toFixed(4));
  if (Math.abs(delta) < 0.0001) return { floorDelta: 0, deliDelta: 0 };
  if (delta > 0) return { floorDelta: delta, deliDelta: 0 };

  let remaining = Math.abs(delta);
  const floorTake = Number(Math.min(Math.max(0, floor), remaining).toFixed(4));
  remaining = Number((remaining - floorTake).toFixed(4));
  const deliTake = Number(Math.min(Math.max(0, deli), remaining).toFixed(4));
  return {
    floorDelta: Number((-floorTake).toFixed(4)),
    deliDelta: Number((-deliTake).toFixed(4)),
  };
}

export function buildStockLevel(input: {
  productId: string;
  name: string;
  supplier: string | null;
  department?: string | null;
  origin?: string | null;
  unitType: string;
  casePackSize: number | null;
  unitCost: number | null;
  onHand: number;
  kitchenPrepQty?: number;
  parCases?: number | null;
  retailPrice?: number | null;
  regularRetailPrice?: number | null;
  daysRemaining?: number | null;
}): StockLevel {
  const department = input.department?.trim() || 'PRODUCE';
  const casePackSize = packSizeOf(input.casePackSize);
  const unitCost = input.unitCost && input.unitCost > 0 ? input.unitCost : 0;
  const onHand = Number(input.onHand.toFixed(2));
  const kitchenPrepQty = Number((input.kitchenPrepQty ?? 0).toFixed(2));
  const rated = stockFromPar({
    onHand,
    casePackSize,
    unitCost,
    parCases: input.parCases ?? DEFAULT_PAR_CASES,
  });

  const retailPrice =
    input.retailPrice !== null && input.retailPrice !== undefined && input.retailPrice > 0
      ? input.retailPrice
      : null;
  const regularRetailPrice =
    input.regularRetailPrice !== null &&
    input.regularRetailPrice !== undefined &&
    input.regularRetailPrice > 0
      ? input.regularRetailPrice
      : null;
  const isMarkdown =
    regularRetailPrice !== null &&
    retailPrice !== null &&
    retailPrice < regularRetailPrice * 0.99;

  const markdownPct =
    isMarkdown && regularRetailPrice && retailPrice
      ? Math.max(1, Math.min(99, Math.round(((regularRetailPrice - retailPrice) / regularRetailPrice) * 100)))
      : null;

  const base = {
    productId: input.productId,
    name: input.name,
    supplier: input.supplier?.trim() || 'Unassigned supplier',
    department,
    productType: input.unitType,
    origin: input.origin?.trim() || null,
    unitType: input.unitType,
    casePackSize,
    unitCost,
    onHand,
    kitchenPrepQty,
    ...rated,
    retailPrice,
    regularRetailPrice,
    isMarkdown,
    markdownPct,
    daysRemaining: Number.isFinite(input.daysRemaining) ? Number(input.daysRemaining) : 7,
  };
  return {
    ...base,
    category: departmentLabel(department),
  };
}

export interface StockOverrideAudit {
  timestamp: string;
  staffId: string;
  staffName: string | null;
  notes: string | null;
}

export async function getLastStockOverrideAudit(productId: string): Promise<StockOverrideAudit | null> {
  const row = await prisma.inventoryTransaction.findFirst({
    where: {
      productId,
      notes: { contains: 'Admin stock override' },
    },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true, staffId: true, notes: true },
  });
  if (!row) return null;
  const user = await prisma.user.findUnique({
    where: { id: row.staffId },
    select: { name: true },
  });
  return {
    timestamp: row.timestamp.toISOString(),
    staffId: row.staffId,
    staffName: user?.name ?? null,
    notes: row.notes,
  };
}

export async function updateProductCatalogMeta(input: {
  productId: string;
  department?: string;
  supplier?: string;
  origin?: string | null;
}): Promise<StockLevel> {
  const data: {
    department?: Department;
    supplier?: string;
    origin?: string | null;
  } = {};
  if (input.department) {
    const allowed = new Set(Object.values(Department));
    if (!allowed.has(input.department as Department)) {
      throw new Error('Invalid department.');
    }
    data.department = input.department as Department;
  }
  if (input.supplier !== undefined) {
    const next = input.supplier.trim();
    if (!next) throw new Error('Supplier is required.');
    data.supplier = next;
  }
  if (input.origin !== undefined) {
    data.origin = input.origin?.trim() || null;
  }
  await prisma.product.update({
    where: { id: input.productId },
    data,
  });
  invalidateInventoryCaches();
  return readStockLevel(input.productId);
}

function daysUntil(expiration: Date | string | null, shelfLifeDays: number): number {
  const fallback = shelfLifeDays > 0 ? shelfLifeDays : 7;
  if (!expiration) return fallback;
  const time = expiration instanceof Date ? expiration.getTime() : new Date(expiration).getTime();
  if (!Number.isFinite(time)) return fallback;
  return Math.ceil((time - Date.now()) / 86_400_000);
}

const STOCK_CACHE_MS = 60_000;
const stockCache = new Map<string, { at: number; gen: number; value: Promise<StockLevel[]> }>();

interface StockLevelRow {
  productId: string;
  name: string;
  supplier: string | null;
  department: string;
  origin: string | null;
  unitType: string;
  casePackSize: number | null;
  standardCost: number | null;
  parCases: number | null;
  retailPrice: number | null;
  regularRetailPrice: number | null;
  shelfLifeDays: number | null;
  expirationDate: Date | null;
  onHand: number;
  kitchenPrepQty: number;
  posSoldInWindow?: number | null;
}

function stockLevelFromRow(row: StockLevelRow): StockLevel {
  return buildStockLevel({
    productId: row.productId,
    name: row.name,
    supplier: row.supplier,
    department: row.department,
    origin: row.origin,
    unitType: row.unitType,
    casePackSize: row.casePackSize,
    unitCost: row.standardCost,
    onHand: Number(row.onHand) || 0,
    kitchenPrepQty: Number(row.kitchenPrepQty) || 0,
    parCases: row.parCases,
    retailPrice: row.retailPrice,
    regularRetailPrice: row.regularRetailPrice,
    daysRemaining: daysUntil(row.expirationDate, row.shelfLifeDays ?? 7),
  });
}

function posSoldSubselect(posSalesFrom: Date) {
  return Prisma.sql`COALESCE((
    SELECT SUM(ABS(s."Qty_Change"))::float8
    FROM "Inventory_Transactions" s
    WHERE s."Product_ID" = p.id
      AND s."Transaction_Type" IN ('Sale'::"TransactionType", 'POS_Sale'::"TransactionType")
      AND s."timestamp" >= ${posSalesFrom}
  ), 0)`;
}

async function queryStockLevelRows(
  productId?: string,
  posSalesFrom?: Date
): Promise<StockLevelRow[]> {
  await ensureProductMarkdownColumn();
  if (productId) {
    return prisma.$queryRaw<StockLevelRow[]>`
      SELECT
        p.id AS "productId",
        p.name,
        p.supplier,
        p.department::text AS department,
        p.origin,
        p."unitType"::text AS "unitType",
        p."casePackSize",
        p."standardCost",
        p."parCases",
        p."retailPrice",
        p."regularRetailPrice",
        p."shelfLifeDays",
        (
          SELECT t2."expirationDate"
          FROM "Inventory_Transactions" t2
          WHERE t2."Product_ID" = p.id
            AND t2."expirationDate" IS NOT NULL
          ORDER BY t2."timestamp" DESC
          LIMIT 1
        ) AS "expirationDate",
        COALESCE(SUM(
          CASE
            WHEN t."To_Location" IN ('Retail_Floor'::"InventoryLocation", 'Deli_Grab_N_Go'::"InventoryLocation") AND t."Qty_Change" > 0 THEN t."Qty_Change"
            WHEN t."From_Location" IN ('Retail_Floor'::"InventoryLocation", 'Deli_Grab_N_Go'::"InventoryLocation") AND t."Qty_Change" < 0 THEN t."Qty_Change"
            ELSE 0
          END
        ), 0)::float8 AS "onHand",
        COALESCE(SUM(
          CASE
            WHEN t."To_Location" = 'Kitchen_Prep'::"InventoryLocation" AND t."Qty_Change" > 0 THEN t."Qty_Change"
            WHEN t."From_Location" = 'Kitchen_Prep'::"InventoryLocation" AND t."Qty_Change" < 0 THEN t."Qty_Change"
            ELSE 0
          END
        ), 0)::float8 AS "kitchenPrepQty"
      FROM products p
      LEFT JOIN "Inventory_Transactions" t ON t."Product_ID" = p.id
      WHERE p.id = ${productId}
      GROUP BY p.id
    `;
  }

  const posCol = posSalesFrom ? posSoldSubselect(posSalesFrom) : Prisma.sql`NULL::float8`;

  return prisma.$queryRaw<StockLevelRow[]>`
    SELECT
      p.id AS "productId",
      p.name,
      p.supplier,
      p.department::text AS department,
      p.origin,
      p."unitType"::text AS "unitType",
      p."casePackSize",
      p."standardCost",
      p."parCases",
      p."retailPrice",
      p."regularRetailPrice",
      p."shelfLifeDays",
      (
        SELECT t2."expirationDate"
        FROM "Inventory_Transactions" t2
        WHERE t2."Product_ID" = p.id
          AND t2."expirationDate" IS NOT NULL
        ORDER BY t2."timestamp" DESC
        LIMIT 1
      ) AS "expirationDate",
      COALESCE(SUM(
        CASE
          WHEN t."To_Location" IN ('Retail_Floor'::"InventoryLocation", 'Deli_Grab_N_Go'::"InventoryLocation") AND t."Qty_Change" > 0 THEN t."Qty_Change"
          WHEN t."From_Location" IN ('Retail_Floor'::"InventoryLocation", 'Deli_Grab_N_Go'::"InventoryLocation") AND t."Qty_Change" < 0 THEN t."Qty_Change"
          ELSE 0
        END
      ), 0)::float8 AS "onHand",
      COALESCE(SUM(
        CASE
          WHEN t."To_Location" = 'Kitchen_Prep'::"InventoryLocation" AND t."Qty_Change" > 0 THEN t."Qty_Change"
          WHEN t."From_Location" = 'Kitchen_Prep'::"InventoryLocation" AND t."Qty_Change" < 0 THEN t."Qty_Change"
          ELSE 0
        END
      ), 0)::float8 AS "kitchenPrepQty",
      ${posCol} AS "posSoldInWindow"
    FROM products p
    LEFT JOIN "Inventory_Transactions" t ON t."Product_ID" = p.id
    WHERE p."isManufactured" = false
      AND p."catalogActive" = true
    GROUP BY p.id
  `;
}

/** Fresh catalog + POS sold in one query (not cached — for transfer UI). */
export async function getStockLevelsWithPosSales(lookbackDays: number): Promise<StockLevel[]> {
  const salesDays = parsePosSalesDaysParam(String(lookbackDays), 7);
  const from = posSalesWindowStart(salesDays);
  const rows = await queryStockLevelRows(undefined, from);
  return rows
    .map((row) => ({
      ...stockLevelFromRow(row),
      posSalesDays: salesDays,
      posSoldInWindow: Number(row.posSoldInWindow ?? 0),
    }))
    .sort(
      (a, b) =>
        Number(b.low) - Number(a.low) ||
        a.supplier.localeCompare(b.supplier) ||
        a.name.localeCompare(b.name)
    );
}

async function loadStockLevelById(productId: string): Promise<StockLevel> {
  const rows = await queryStockLevelRows(productId);
  const row = rows[0];
  if (!row) throw new Error('Item was not found.');
  return stockLevelFromRow(row);
}

async function loadStockLevels(): Promise<StockLevel[]> {
  const rows = await queryStockLevelRows();
  return rows
    .map(stockLevelFromRow)
    .sort(
      (a, b) =>
        Number(b.low) - Number(a.low) ||
        a.supplier.localeCompare(b.supplier) ||
        a.name.localeCompare(b.name)
    );
}

export function getStockLevels(): Promise<StockLevel[]> {
  return rememberLedgerRead(stockCache, 'levels', STOCK_CACHE_MS, loadStockLevels);
}

async function readStockLevel(productId: string): Promise<StockLevel> {
  return loadStockLevelById(productId);
}

/** One SKU — single aggregated SQL round-trip (moves, sales, levels API). */
export function getStockLevel(productId: string): Promise<StockLevel> {
  return loadStockLevelById(productId);
}

export async function applyRetailMarkdown(
  productId: string,
  staffId: string,
  discountPct: number = 30
): Promise<{ level: StockLevel }> {
  const actor = staffId.trim() || 'staff-floor';
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error('Item was not found.');

  const floorQty = await getCurrentStock(productId, InventoryLocation.Retail_Floor);
  if (!(floorQty > 0)) throw new Error('Nothing is on the retail floor to mark down.');

  const margin = product.targetMargin > 0 ? product.targetMargin : 0.4;
  const cost = product.standardCost && product.standardCost > 0 ? product.standardCost : 0;
  const derivedPrice = cost > 0 ? Number((cost / (1 - margin)).toFixed(2)) : null;
  const prices = await readProductRetailPrices(productId);
  const shelfPrice = prices.retailPrice ?? product.retailPrice ?? derivedPrice;
  if (shelfPrice === null || shelfPrice <= 0) {
    throw new Error('Set a retail price before applying a markdown.');
  }

  const validDiscountPct = Math.max(5, Math.min(90, Math.round(discountPct || 30)));
  const regular = prices.regularRetailPrice ?? shelfPrice;
  const targetMultiplier = (100 - validDiscountPct) / 100;
  const targetPrice = Number((regular * targetMultiplier).toFixed(2));

  // If already at or within 1 cent of the target discount, return current stock level
  if (
    prices.regularRetailPrice &&
    prices.retailPrice &&
    Math.abs(prices.retailPrice - targetPrice) < 0.02
  ) {
    return { level: await readStockLevel(productId) };
  }

  const regularToStore = prices.regularRetailPrice ?? regular;
  const referenceId = `MD-${Date.now()}`;
  const revenueImpact = markdownRevenueImpact(floorQty, regularToStore, targetPrice);

  await prisma.$transaction(async (tx) => {
    await tx.markdownEvent.create({
      data: {
        productId,
        staffId: actor,
        quantityUnits: floorQty,
        regularPrice: regularToStore,
        markdownPrice: targetPrice,
        discountPct: validDiscountPct,
        revenueImpact,
        referenceId,
      },
    });
    await writeProductMarkdownPrices(productId, regularToStore, targetPrice, tx);
  });
  invalidateInventoryCaches();
  return { level: await readStockLevel(productId) };
}

export async function setStockCases(productId: string, cases: number, staffId: string): Promise<StockLevel> {
  if (!Number.isFinite(cases) || cases < 0) {
    throw new Error('Cases must be zero or greater.');
  }
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error('Item was not found.');
  const pack = product.casePackSize && product.casePackSize > 0 ? product.casePackSize : 1;
  const targetUnits = Number((cases * pack).toFixed(4));
  const onHand = await getCurrentStock(productId);
  const delta = Number((targetUnits - onHand).toFixed(4));
  if (Math.abs(delta) >= 0.0001) {
    const shrink = delta < 0;
    const unitCost = product.standardCost && product.standardCost > 0 ? product.standardCost : 0;
    const referenceId = `ADJ-${Date.now()}`;
    await prisma.$transaction(async (tx) => {
      const created = await tx.inventoryTransaction.create({
        data: {
          productId,
          staffId: staffId.trim() || 'staff-admin',
          qtyChange: delta,
          transactionType: shrink ? TransactionType.Waste : TransactionType.Receive,
          fromLocation: shrink ? InventoryLocation.Retail_Floor : InventoryLocation.External_Vendor,
          toLocation: shrink ? InventoryLocation.Waste_Bin : InventoryLocation.Retail_Floor,
          unitCostAtTime: unitCost,
          referenceId,
          notes: shrink ? 'Admin stock override: shrink' : 'Admin stock override: add cases',
        },
      });
      await alignLotsToLedger(tx, {
        productId,
        location: InventoryLocation.Retail_Floor,
        unitCost,
        receiveReferenceId: referenceId,
        receiveTransactionId: created.id,
      });
    });
  }
  invalidateInventoryCaches();
  return readStockLevel(productId);
}

/** Admin-only: hide SKU from catalogs. Does not delete ledger history. */
export async function removeProductFromCatalog(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, isManufactured: true },
  });
  if (!product) throw new Error('Product not found.');
  if (product.isManufactured) {
    throw new Error('Manufactured items cannot be removed from the purchase catalog.');
  }
  await prisma.product.update({
    where: { id: productId },
    data: { catalogActive: false },
  });
  invalidateInventoryCaches();
}

export async function setSupplier(productId: string, supplier: string): Promise<StockLevel> {
  const nextSupplier = supplier.trim();
  if (!nextSupplier) {
    throw new Error('Supplier is required.');
  }
  await prisma.product.update({
    where: { id: productId },
    data: { supplier: nextSupplier },
  });
  invalidateInventoryCaches();
  return readStockLevel(productId);
}

export async function updateCase(input: {
  productId: string;
  packSize: number;
  yieldDivisor: number;
  retailUnit: string;
  retailPrice: number;
}): Promise<StockLevel> {
  if (!(input.packSize > 0) || !(input.yieldDivisor > 0)) {
    throw new Error('Pack size and yield divisor must be greater than 0.');
  }
  const unitsPerCase = input.packSize / input.yieldDivisor;
  await prisma.product.update({
    where: { id: input.productId },
    data: {
      casePackSize: unitsPerCase,
      unitType: unitTypeFor(input.retailUnit),
      retailPrice: input.retailPrice > 0 ? input.retailPrice : null,
    },
  });
  invalidateInventoryCaches();
  return readStockLevel(input.productId);
}

export async function setParCases(productId: string, parCases: number): Promise<StockLevel> {
  const nextPar = normalizeParCases(parCases);
  await prisma.product.update({
    where: { id: productId },
    data: { parCases: nextPar },
  });
  invalidateInventoryCaches();
  return readStockLevel(productId);
}

export interface OnHandLookup {
  matched: boolean;
  productId: string | null;
  productName: string | null;
  onHand: number;
}

export async function lookupOnHand(itemName: string): Promise<OnHandLookup> {
  const products = await prisma.product.findMany({
    where: { isManufactured: false },
    select: { id: true, name: true },
  });
  const match = matchProduct(itemName, products);
  if (!match) {
    return { matched: false, productId: null, productName: null, onHand: 0 };
  }
  const onHand = await getCurrentStock(match.id);
  return {
    matched: true,
    productId: match.id,
    productName: match.name,
    onHand: Number(onHand.toFixed(2)),
  };
}

function departmentFor(itemName: string): Department {
  const name = itemName.toLowerCase();
  if (/cream|yogurt|milk|cheese|butter/.test(name)) return Department.DAIRY;
  if (/bread|sourdough|loaf|baguette|pastry/.test(name)) return Department.BAKERY;
  if (/oil|vinegar|flour|sugar|rice|pasta|bean/.test(name)) return Department.PANTRY;
  return Department.PRODUCE;
}

function unitTypeFor(retailUnit: string): UnitType {
  if (retailUnit === 'lbs') return UnitType.LBS;
  return UnitType.UNIT;
}

export async function postReceipt(input: {
  itemName: string;
  casesReceived: number;
  caseCost: number;
  packSize: number;
  yieldDivisor: number;
  retailPrice: number;
  retailUnit?: string;
  staffId?: string;
  targetMargin?: number;
}): Promise<PostedReceipt | SkippedReceipt> {
  const unitsPerCase = input.yieldDivisor > 0 ? input.packSize / input.yieldDivisor : 0;
  const unitsAdded = Number((input.casesReceived * unitsPerCase).toFixed(4));
  if (!(unitsAdded > 0)) {
    return { posted: false, reason: 'Pack size did not produce any retail units.' };
  }

  const unitCost = unitsPerCase > 0 ? input.caseCost / unitsPerCase : input.caseCost;
  const posted = await prisma.$transaction(async (tx) => {
    const ensured = await findOrCreatePurchaseProduct(
      {
        itemName: input.itemName,
        casePackSize: unitsPerCase,
        unitCost: Number(unitCost.toFixed(4)),
        retailUnit: input.retailUnit,
        supplier: 'Received at the dock',
      },
      tx
    );
    const productId = ensured.id;
    const yieldPct =
      input.yieldDivisor > 0 ? Number((100 / input.yieldDivisor).toFixed(2)) : undefined;
    const product = await tx.product.update({
      where: { id: productId },
      data: {
        casePackSize: unitsPerCase,
        unitType: unitTypeFor(input.retailUnit ?? 'units'),
        standardCost: Number(unitCost.toFixed(4)),
        ...(input.retailPrice > 0 ? { retailPrice: input.retailPrice } : {}),
        ...(yieldPct !== undefined ? { yieldPct } : {}),
        ...(input.targetMargin !== undefined && input.targetMargin >= 0
          ? { targetMargin: input.targetMargin }
          : {}),
      },
      select: { id: true, name: true, shelfLifeDays: true },
    });
    const shelfDays = product.shelfLifeDays > 0 ? product.shelfLifeDays : 7;
    const expirationDate = new Date(Date.now() + shelfDays * 24 * 60 * 60 * 1000);
    const referenceId = `RCV-${Date.now()}`;
    const created = await tx.inventoryTransaction.create({
      data: {
        productId: product.id,
        staffId: input.staffId?.trim() || 'staff-receiver-01',
        qtyChange: unitsAdded,
        transactionType: TransactionType.Receive,
        fromLocation: InventoryLocation.External_Vendor,
        toLocation: InventoryLocation.Retail_Floor,
        unitCostAtTime: Number(unitCost.toFixed(4)),
        referenceId,
        expirationDate,
        notes: `Received ${input.casesReceived} cases of ${input.itemName}`,
      },
    });
    await createLotOnReceive(tx, {
      productId: product.id,
      location: InventoryLocation.Retail_Floor,
      qty: unitsAdded,
      unitCostAtTime: Number(unitCost.toFixed(4)),
      expirationDate,
      receiveReferenceId: referenceId,
      receiveTransactionId: created.id,
    });
    return { product, created };
  });

  invalidateInventoryCaches();
  const onHand = await getCurrentStock(posted.product.id);
  return {
    posted: true,
    productId: posted.product.id,
    productName: posted.product.name,
    unitsAdded,
    onHand,
    transactionId: posted.created.id,
  };
}

/** Receive known catalog SKUs (invoice OCR confirm, POS backfill). Sets cost, expiration, and optional retail price. */
export async function postProductReceipt(
  input: {
    productId: string;
    quantityUnits: number;
    unitCostAtTime: number;
    staffId: string;
    referenceId?: string;
    toLocation?: InventoryLocation;
    notes?: string;
    retailPrice?: number;
  },
  db?: LotTx
): Promise<{ transactionId: string; productId: string; unitsAdded: number; onHand: number }> {
  const productId = input.productId?.trim();
  if (!productId) throw new Error('productId is required.');
  const unitsAdded = Number(Math.abs(input.quantityUnits).toFixed(4));
  if (!(unitsAdded > 0)) throw new Error('Receive quantity must be greater than zero.');

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error('Product was not found.');

  const unitCost = Number(Math.max(0, input.unitCostAtTime).toFixed(4));
  const shelfDays = product.shelfLifeDays > 0 ? product.shelfLifeDays : 7;
  const actor = input.staffId.trim() || 'staff-receiver-01';
  const toLocation = input.toLocation ?? InventoryLocation.Retail_Floor;

  const expirationDate = new Date(Date.now() + shelfDays * 24 * 60 * 60 * 1000);
  const referenceId = input.referenceId?.trim() || `RCV-PROD-${Date.now()}`;

  const write = async (tx: LotTx) => {
    await tx.product.update({
      where: { id: productId },
      data: {
        ...(unitCost > 0 ? { standardCost: unitCost } : {}),
        ...(input.retailPrice !== undefined && input.retailPrice > 0
          ? { retailPrice: input.retailPrice }
          : {}),
      },
    });
    const row = await tx.inventoryTransaction.create({
      data: {
        productId,
        staffId: actor,
        qtyChange: unitsAdded,
        transactionType: TransactionType.Receive,
        fromLocation: InventoryLocation.External_Vendor,
        toLocation,
        unitCostAtTime: unitCost,
        referenceId,
        expirationDate,
        notes: input.notes?.trim() || 'Product receipt',
      },
    });
    await createLotOnReceive(tx, {
      productId,
      location: toLocation,
      qty: unitsAdded,
      unitCostAtTime: unitCost,
      expirationDate,
      receiveReferenceId: referenceId,
      receiveTransactionId: row.id,
    });
    const onHand = await getCurrentStock(productId, toLocation, tx);
    return {
      transactionId: row.id,
      productId,
      unitsAdded,
      onHand,
    };
  };

  if (db) return write(db);

  const result = await prisma.$transaction(write);
  invalidateInventoryCaches();
  return result;
}

export async function moveRetailStock(
  productId: string,
  action: 'waste' | 'rescue',
  staffId: string,
  quantity?: number
): Promise<{ level: StockLevel; units: number }> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error('Item was not found.');
  const floorQty = await getCurrentStock(productId, InventoryLocation.Retail_Floor);
  if (!(floorQty > 0)) throw new Error('Nothing is on the retail floor to move.');
  const requested =
    quantity !== undefined && Number.isFinite(quantity)
      ? Number(quantity)
      : floorQty;
  const qty = Number(Math.min(floorQty, Math.max(0, requested)).toFixed(4));
  if (!(qty > 0)) throw new Error('Transfer quantity must be greater than zero.');
  const cost = product.standardCost && product.standardCost > 0 ? product.standardCost : 0;
  const actor = staffId.trim() || 'staff-floor';
  const referenceId = `${action === 'waste' ? 'WASTE' : 'RESCUE'}-${Date.now()}`;
  const shared = {
    productId,
    staffId: actor,
    unitCostAtTime: cost,
    referenceId,
    fromLocation: InventoryLocation.Retail_Floor,
  };

  await prisma.$transaction(async (tx) => {
    if (action === 'waste') {
      await consumeLotsFifo(tx, {
        productId,
        location: InventoryLocation.Retail_Floor,
        qty,
        unitCost: cost,
      });
      await tx.inventoryTransaction.create({
        data: {
          ...shared,
          qtyChange: -qty,
          transactionType: TransactionType.Waste,
          toLocation: InventoryLocation.Waste_Bin,
          notes: 'Discarded from inventory to waste',
        },
      });
      return;
    }

    await transferLotsFifo(tx, {
      productId,
      fromLocation: InventoryLocation.Retail_Floor,
      toLocation: InventoryLocation.Kitchen_Prep,
      qty,
      receiveReferenceId: referenceId,
      unitCost: cost,
    });
    await tx.inventoryTransaction.create({
      data: {
        ...shared,
        qtyChange: -qty,
        transactionType: TransactionType.Rescue,
        toLocation: InventoryLocation.Kitchen_Prep,
        notes: 'Transferred from the retail floor to kitchen rescue',
      },
    });
    await tx.inventoryTransaction.create({
      data: {
        ...shared,
        qtyChange: qty,
        transactionType: TransactionType.Rescue,
        toLocation: InventoryLocation.Kitchen_Prep,
        notes: 'Received in kitchen rescue from the retail floor',
      },
    });
  }, LEDGER_WRITE_TX);

  invalidateInventoryCaches();
  return { level: await readStockLevel(productId), units: qty };
}

/** Discard quantity from `Kitchen_Prep` into `Waste_Bin` (prep spoilage). */
export async function moveKitchenPrepToWaste(
  productId: string,
  staffId: string,
  quantity?: number
): Promise<{ level: StockLevel; units: number }> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error('Item was not found.');
  const prepQty = await getCurrentStock(productId, InventoryLocation.Kitchen_Prep);
  if (!(prepQty > 0)) throw new Error('Nothing is in production prep to discard.');
  const requested =
    quantity !== undefined && Number.isFinite(quantity) ? Number(quantity) : prepQty;
  const qty = Number(Math.min(prepQty, Math.max(0, requested)).toFixed(4));
  if (!(qty > 0)) throw new Error('Transfer quantity must be greater than zero.');
  const cost = product.standardCost && product.standardCost > 0 ? product.standardCost : 0;
  await prisma.$transaction(async (tx) => {
    await consumeLotsFifo(tx, {
      productId,
      location: InventoryLocation.Kitchen_Prep,
      qty,
      unitCost: cost,
    });
    await tx.inventoryTransaction.create({
      data: {
        productId,
        staffId: staffId.trim() || 'staff-kitchen',
        qtyChange: -qty,
        transactionType: TransactionType.Waste,
        fromLocation: InventoryLocation.Kitchen_Prep,
        toLocation: InventoryLocation.Waste_Bin,
        unitCostAtTime: cost,
        referenceId: `KITCHEN-WASTE-${Date.now()}`,
        notes: 'Discarded from kitchen prep to waste',
      },
    });
  }, LEDGER_WRITE_TX);
  invalidateInventoryCaches();
  return { level: await readStockLevel(productId), units: qty };
}

/** Persists volumetric kitchen scrap as Waste rows tagged with `VOL-SCRAP-BUCKET`. */
export async function logVolumetricScrapBuckets(
  buckets: number,
  staffId: string
): Promise<{
  buckets: number;
  referenceId: string;
  preview: ReturnType<typeof buildVolumetricScrapNotes>;
}> {
  if (!Number.isFinite(buckets) || buckets <= 0) {
    throw new Error('Bucket count must be greater than zero.');
  }
  const anchor = await prisma.product.findFirst({
    where: { isManufactured: false },
    select: { id: true },
    orderBy: { name: 'asc' },
  });
  if (!anchor) throw new Error('No catalog product available to anchor scrap ledger rows.');
  const settings = await findLatestStoreSetting();
  const scrapSettings = {
    scrapBucketVolumeL: settings?.scrapBucketVolumeL ?? 20,
    estimatedWeightPerLiterKg: settings?.estimatedWeightPerLiterKg ?? 0.65,
    defaultScrapCostPerKg: settings?.defaultScrapCostPerKg ?? 3.5,
  };
  const qty = Number(buckets.toFixed(4));
  const referenceId = `${VOLUMETRIC_SCRAP_REF_PREFIX}-${Date.now()}`;
  const preview = buildVolumetricScrapNotes(qty, scrapSettings);
  const notes = serializeVolumetricScrapNotes(preview);

  await prisma.$transaction(async (tx) => {
    await tx.inventoryTransaction.create({
      data: {
        productId: anchor.id,
        staffId: staffId.trim() || 'staff-kitchen',
        qtyChange: qty,
        transactionType: TransactionType.Waste,
        fromLocation: InventoryLocation.Kitchen_Prep,
        toLocation: InventoryLocation.Waste_Bin,
        unitCostAtTime: 0,
        referenceId,
        notes,
      },
    });
  }, LEDGER_WRITE_TX);

  invalidateInventoryCaches();
  return { buckets: qty, referenceId, preview };
}
