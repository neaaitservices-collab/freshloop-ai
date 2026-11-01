import { Department, InventoryLocation, TransactionType, UnitType } from '@prisma/client';
import { getCurrentStock, prisma, VOLUMETRIC_SCRAP_REF_PREFIX } from '@/lib/domains/inventory/ledger';
import { rememberLedgerRead } from '@/lib/domains/inventory/ledgerCache';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { DEFAULT_PAR_CASES, normalizeParCases, stockFromPar } from '@/lib/domains/inventory/parLevel';
import {
  ensureProductMarkdownColumn,
  readProductRetailPrices,
  writeProductMarkdownPrices,
} from '@/lib/domains/inventory/productMarkdownColumn';
import { consumeLotsFifo, createLotOnReceive, transferLotsFifo } from '@/lib/domains/inventory/lots';
import { markdownRevenueImpact } from '@/lib/utils/money';

export const PAR_CASES = DEFAULT_PAR_CASES;

export interface StockLevel {
  productId: string;
  name: string;
  supplier: string;
  unitType: string;
  casePackSize: number;
  unitCost: number;
  /** Units on `Retail_Floor` (what shoppers see on shelf). */
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

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token.length > 2);
}

export function matchProduct<T extends { name: string }>(itemName: string, products: T[]): T | null {
  const needle = compact(itemName);
  const needleTokens = new Set(tokens(itemName));
  let best: { product: T; score: number } | null = null;

  for (const product of products) {
    const hay = compact(product.name);
    let score = 0;
    if (hay === needle) score = 100;
    else if (needle.length > 4 && (hay.includes(needle) || needle.includes(hay))) score = 80;
    else score = tokens(product.name).filter((token) => needleTokens.has(token)).length * 10;

    if (!best || score > best.score) best = { product, score };
  }

  if (!best || best.score < 20) return null;
  return best.product;
}

function packSizeOf(value: number | null | undefined): number {
  return value && value > 0 ? value : 1;
}

export function buildStockLevel(input: {
  productId: string;
  name: string;
  supplier: string | null;
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

  return {
    productId: input.productId,
    name: input.name,
    supplier: input.supplier?.trim() || 'Unassigned supplier',
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
}

async function loadStockLevels(): Promise<StockLevel[]> {
  await ensureProductMarkdownColumn();
  const rows = await prisma.$queryRaw<StockLevelRow[]>`
    SELECT
      p.id AS "productId",
      p.name,
      p.supplier,
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
    GROUP BY p.id
  `;

  return rows
    .map((row) =>
      buildStockLevel({
        productId: row.productId,
        name: row.name,
        supplier: row.supplier,
        unitType: row.unitType,
        casePackSize: row.casePackSize,
        unitCost: row.standardCost,
        onHand: Number(row.onHand) || 0,
        kitchenPrepQty: Number(row.kitchenPrepQty) || 0,
        parCases: row.parCases,
        retailPrice: row.retailPrice,
        regularRetailPrice: row.regularRetailPrice,
        daysRemaining: daysUntil(row.expirationDate, row.shelfLifeDays ?? 7),
      })
    )
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
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  const [onHand, kitchenPrepQty, prices, latest] = await Promise.all([
    getCurrentStock(productId, InventoryLocation.Retail_Floor),
    getCurrentStock(productId, InventoryLocation.Kitchen_Prep),
    readProductRetailPrices(productId),
    prisma.inventoryTransaction.findFirst({
      where: { productId, expirationDate: { not: null } },
      orderBy: { timestamp: 'desc' },
      select: { expirationDate: true },
    }),
  ]);
  return buildStockLevel({
    productId: product.id,
    name: product.name,
    supplier: product.supplier,
    unitType: product.unitType,
    casePackSize: product.casePackSize,
    unitCost: product.standardCost,
    onHand,
    kitchenPrepQty,
    parCases: product.parCases,
    retailPrice: prices.retailPrice ?? product.retailPrice,
    regularRetailPrice: prices.regularRetailPrice,
    daysRemaining: daysUntil(latest?.expirationDate ?? null, product.shelfLifeDays),
  });
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

  await prisma.$transaction([
    prisma.markdownEvent.create({
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
    }),
  ]);
  await writeProductMarkdownPrices(productId, regularToStore, targetPrice);
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
    await prisma.inventoryTransaction.create({
      data: {
        productId,
        staffId: staffId.trim() || 'staff-admin',
        qtyChange: delta,
        transactionType: shrink ? TransactionType.Waste : TransactionType.Receive,
        fromLocation: shrink ? InventoryLocation.Retail_Floor : InventoryLocation.External_Vendor,
        toLocation: shrink ? InventoryLocation.Waste_Bin : InventoryLocation.Retail_Floor,
        unitCostAtTime: product.standardCost && product.standardCost > 0 ? product.standardCost : 0,
        referenceId: `ADJ-${Date.now()}`,
        notes: shrink ? 'Admin stock override: shrink' : 'Admin stock override: add cases',
      },
    });
  }
  invalidateInventoryCaches();
  return readStockLevel(productId);
}

export async function setSupplier(productId: string, supplier: string): Promise<StockLevel> {
  const nextSupplier = supplier.trim();
  if (!nextSupplier) {
    throw new Error('Supplier is required.');
  }
  const product = await prisma.product.update({
    where: { id: productId },
    data: { supplier: nextSupplier },
  });
  invalidateInventoryCaches();
  const onHand = await getCurrentStock(productId);
  return buildStockLevel({
    productId: product.id,
    name: product.name,
    supplier: product.supplier,
    unitType: product.unitType,
    casePackSize: product.casePackSize,
    unitCost: product.standardCost,
    onHand,
    parCases: product.parCases,
    retailPrice: product.retailPrice,
  });
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
  const product = await prisma.product.update({
    where: { id: input.productId },
    data: {
      casePackSize: unitsPerCase,
      unitType: unitTypeFor(input.retailUnit),
      retailPrice: input.retailPrice > 0 ? input.retailPrice : null,
    },
  });
  invalidateInventoryCaches();
  const onHand = await getCurrentStock(input.productId);
  return buildStockLevel({
    productId: product.id,
    name: product.name,
    supplier: product.supplier,
    unitType: product.unitType,
    casePackSize: product.casePackSize,
    unitCost: product.standardCost,
    onHand,
    parCases: product.parCases,
    retailPrice: product.retailPrice,
  });
}

export async function setParCases(productId: string, parCases: number): Promise<StockLevel> {
  const nextPar = normalizeParCases(parCases);
  const product = await prisma.product.update({
    where: { id: productId },
    data: { parCases: nextPar },
  });
  invalidateInventoryCaches();
  const onHand = await getCurrentStock(productId);
  return buildStockLevel({
    productId: product.id,
    name: product.name,
    supplier: product.supplier,
    unitType: product.unitType,
    casePackSize: product.casePackSize,
    unitCost: product.standardCost,
    onHand,
    parCases: product.parCases,
    retailPrice: product.retailPrice,
  });
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

  const products = await prisma.product.findMany({
    where: { isManufactured: false },
    select: { id: true, name: true, shelfLifeDays: true },
  });
  const match = matchProduct(input.itemName, products);
  const unitCost = unitsPerCase > 0 ? input.caseCost / unitsPerCase : input.caseCost;
  const posted = await prisma.$transaction(async (tx) => {
    let productId = match?.id;
    if (!productId) {
      const createdProduct = await tx.product.create({
        data: {
          name: input.itemName.trim(),
          department: departmentFor(input.itemName),
          unitType: unitTypeFor(input.retailUnit ?? 'units'),
          casePackSize: unitsPerCase,
          standardCost: Number(unitCost.toFixed(4)),
          retailPrice: input.retailPrice > 0 ? input.retailPrice : null,
          supplier: 'Received at the dock',
          shelfLifeDays: 7,
        },
        select: { id: true },
      });
      productId = createdProduct.id;
    }
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
export async function postProductReceipt(input: {
  productId: string;
  quantityUnits: number;
  unitCostAtTime: number;
  staffId: string;
  referenceId?: string;
  toLocation?: InventoryLocation;
  notes?: string;
  retailPrice?: number;
}): Promise<{ transactionId: string; productId: string; unitsAdded: number; onHand: number }> {
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

  const created = await prisma.$transaction(async (tx) => {
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
    return row;
  });

  invalidateInventoryCaches();
  const onHand = await getCurrentStock(productId, toLocation);
  return {
    transactionId: created.id,
    productId,
    unitsAdded,
    onHand,
  };
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
  });

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
  if (!(prepQty > 0)) throw new Error('Nothing is in kitchen prep to discard.');
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
  });
  invalidateInventoryCaches();
  return { level: await readStockLevel(productId), units: qty };
}

/** Persists volumetric kitchen scrap as Waste rows tagged with `VOL-SCRAP-BUCKET`. */
export async function logVolumetricScrapBuckets(
  buckets: number,
  staffId: string
): Promise<{ buckets: number; referenceId: string }> {
  if (!Number.isFinite(buckets) || buckets <= 0) {
    throw new Error('Bucket count must be greater than zero.');
  }
  const anchor = await prisma.product.findFirst({
    where: { isManufactured: false },
    select: { id: true },
    orderBy: { name: 'asc' },
  });
  if (!anchor) throw new Error('No catalog product available to anchor scrap ledger rows.');
  const settings = await prisma.storeSetting.findFirst();
  const scrapBucketVolumeL = settings?.scrapBucketVolumeL ?? 20;
  const qty = Number(buckets.toFixed(4));
  const referenceId = `${VOLUMETRIC_SCRAP_REF_PREFIX}-${Date.now()}`;
  await prisma.inventoryTransaction.create({
    data: {
      productId: anchor.id,
      staffId: staffId.trim() || 'staff-kitchen',
      qtyChange: qty,
      transactionType: TransactionType.Waste,
      fromLocation: InventoryLocation.Kitchen_Prep,
      toLocation: InventoryLocation.Waste_Bin,
      unitCostAtTime: 0,
      referenceId,
      notes: `Volumetric scrap: ${qty} bucket(s) at ${scrapBucketVolumeL}L`,
    },
  });
  invalidateInventoryCaches();
  return { buckets: qty, referenceId };
}
