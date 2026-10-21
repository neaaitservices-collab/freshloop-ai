import { Department, InventoryLocation, TransactionType, UnitType } from '@prisma/client';
import { getCurrentStock, prisma } from '@/lib/inventory';
import { invalidateLedgerReads, rememberLedgerRead } from '@/lib/ledgerCache';
import { DEFAULT_PAR_CASES, normalizeParCases, stockFromPar } from '@/lib/parLevel';

export const PAR_CASES = DEFAULT_PAR_CASES;

export interface StockLevel {
  productId: string;
  name: string;
  supplier: string;
  unitType: string;
  casePackSize: number;
  unitCost: number;
  onHand: number;
  parUnits: number;
  onHandCases: number;
  parCases: number;
  orderCases: number;
  orderCost: number;
  low: boolean;
  retailPrice: number | null;
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
  parCases?: number | null;
  retailPrice?: number | null;
  daysRemaining?: number | null;
}): StockLevel {
  const casePackSize = packSizeOf(input.casePackSize);
  const unitCost = input.unitCost && input.unitCost > 0 ? input.unitCost : 0;
  const onHand = Number(input.onHand.toFixed(2));
  const rated = stockFromPar({
    onHand,
    casePackSize,
    unitCost,
    parCases: input.parCases ?? DEFAULT_PAR_CASES,
  });

  return {
    productId: input.productId,
    name: input.name,
    supplier: input.supplier?.trim() || 'Unassigned supplier',
    unitType: input.unitType,
    casePackSize,
    unitCost,
    onHand,
    ...rated,
    retailPrice:
      input.retailPrice !== null && input.retailPrice !== undefined && input.retailPrice > 0
        ? input.retailPrice
        : null,
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
  shelfLifeDays: number | null;
  expirationDate: Date | null;
  onHand: number;
}

async function loadStockLevels(): Promise<StockLevel[]> {
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
      p."shelfLifeDays",
      (
        SELECT t2."expirationDate"
        FROM "Inventory_Transactions" t2
        WHERE t2."Product_ID" = p.id
          AND t2."expirationDate" IS NOT NULL
        ORDER BY t2."timestamp" DESC
        LIMIT 1
      ) AS "expirationDate",
      COALESCE(SUM(t."Qty_Change"), 0)::float8 AS "onHand"
    FROM products p
    LEFT JOIN "Inventory_Transactions" t ON t."Product_ID" = p.id
    WHERE p."isManufactured" = false
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
        parCases: row.parCases,
        retailPrice: row.retailPrice,
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
  const onHand = await getCurrentStock(productId);
  const latest = await prisma.inventoryTransaction.findFirst({
    where: { productId, expirationDate: { not: null } },
    orderBy: { timestamp: 'desc' },
    select: { expirationDate: true },
  });
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
    daysRemaining: daysUntil(latest?.expirationDate ?? null, product.shelfLifeDays),
  });
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
  invalidateLedgerReads();
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
  invalidateLedgerReads();
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
  invalidateLedgerReads();
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
  invalidateLedgerReads();
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
    const product = await tx.product.update({
      where: { id: productId },
      data: {
        casePackSize: unitsPerCase,
        unitType: unitTypeFor(input.retailUnit ?? 'units'),
        standardCost: Number(unitCost.toFixed(4)),
        ...(input.retailPrice > 0 ? { retailPrice: input.retailPrice } : {}),
      },
      select: { id: true, name: true, shelfLifeDays: true },
    });
    const shelfDays = product.shelfLifeDays > 0 ? product.shelfLifeDays : 7;
    const created = await tx.inventoryTransaction.create({
      data: {
        productId: product.id,
        staffId: 'staff-receiver-01',
        qtyChange: unitsAdded,
        transactionType: TransactionType.Receive,
        fromLocation: InventoryLocation.External_Vendor,
        toLocation: InventoryLocation.Retail_Floor,
        unitCostAtTime: Number(unitCost.toFixed(4)),
        referenceId: `RCV-${Date.now()}`,
        expirationDate: new Date(Date.now() + shelfDays * 24 * 60 * 60 * 1000),
        notes: `Received ${input.casesReceived} cases of ${input.itemName}`,
      },
    });
    return { product, created };
  });

  invalidateLedgerReads();
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
