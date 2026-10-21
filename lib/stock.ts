import { Department, InventoryLocation, TransactionType, UnitType } from '@prisma/client';
import { getCurrentStock, prisma } from '@/lib/inventory';
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
  };
}

export async function getStockLevels(): Promise<StockLevel[]> {
  const [products, sums] = await Promise.all([
    prisma.product.findMany({
      where: { isManufactured: false },
      orderBy: [{ supplier: 'asc' }, { name: 'asc' }],
    }),
    prisma.inventoryTransaction.groupBy({
      by: ['productId'],
      _sum: { qtyChange: true },
    }),
  ]);

  const onHandById = new Map(sums.map((row) => [row.productId, row._sum.qtyChange ?? 0]));

  return products
    .map((product) =>
      buildStockLevel({
        productId: product.id,
        name: product.name,
        supplier: product.supplier,
        unitType: product.unitType,
        casePackSize: product.casePackSize,
        unitCost: product.standardCost,
        onHand: onHandById.get(product.id) ?? 0,
        parCases: product.parCases,
      })
    )
    .sort((a, b) => Number(b.low) - Number(a.low) || a.supplier.localeCompare(b.supplier) || a.name.localeCompare(b.name));
}

export async function setParCases(productId: string, parCases: number): Promise<StockLevel> {
  const nextPar = normalizeParCases(parCases);
  const product = await prisma.product.update({
    where: { id: productId },
    data: { parCases: nextPar },
  });
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
  let match = matchProduct(input.itemName, products);
  if (!match) {
    const created = await prisma.product.create({
      data: {
        name: input.itemName.trim(),
        department: departmentFor(input.itemName),
        unitType: unitTypeFor(input.retailUnit ?? 'units'),
        casePackSize: unitsPerCase,
        standardCost: unitsPerCase > 0 ? input.caseCost / unitsPerCase : input.caseCost,
        retailPrice: input.retailPrice > 0 ? input.retailPrice : null,
        supplier: 'Received at the dock',
        shelfLifeDays: 7,
      },
      select: { id: true, name: true, shelfLifeDays: true },
    });
    match = created;
  }

  const unitCost = unitsPerCase > 0 ? input.caseCost / unitsPerCase : input.caseCost;
  const shelfDays = match.shelfLifeDays > 0 ? match.shelfLifeDays : 7;
  const created = await prisma.inventoryTransaction.create({
    data: {
      productId: match.id,
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

  if (input.retailPrice > 0) {
    await prisma.product.update({
      where: { id: match.id },
      data: { retailPrice: input.retailPrice },
    });
  }

  const onHand = await getCurrentStock(match.id);
  return {
    posted: true,
    productId: match.id,
    productName: match.name,
    unitsAdded,
    onHand,
    transactionId: created.id,
  };
}
