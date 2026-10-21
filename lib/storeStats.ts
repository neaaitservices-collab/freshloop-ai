import { InventoryLocation, TransactionType } from '@prisma/client';
import { prisma, VOLUMETRIC_SCRAP_REF_PREFIX } from '@/lib/inventory';
import type { DepartmentAlert, StoreStats } from '@/lib/storeStatsTypes';

export type { DepartmentAlert, RescueSlice, RevenueDay, StoreStats } from '@/lib/storeStatsTypes';

const DEPARTMENT_LABELS: Record<string, string> = {
  PRODUCE: 'Produce',
  DAIRY: 'Dairy',
  BAKERY: 'Bakery',
  PANTRY: 'Pantry',
  DELI_KITCHEN: 'Deli',
};

function money(value: number): number {
  return Number(value.toFixed(2));
}

function unitRetail(retailPrice: number | null | undefined, unitCost: number): number {
  if (typeof retailPrice === 'number' && retailPrice > 0) return retailPrice;
  if (unitCost > 0) return unitCost;
  return 0;
}

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getStoreStats(): Promise<StoreStats> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);

  const [products, sums, expirations, movements] = await Promise.all([
    prisma.product.findMany({
      where: { isManufactured: false },
      select: {
        id: true,
        department: true,
        standardCost: true,
        retailPrice: true,
        casePackSize: true,
        parCases: true,
      },
    }),
    prisma.inventoryTransaction.groupBy({
      by: ['productId'],
      _sum: { qtyChange: true },
    }),
    prisma.inventoryTransaction.findMany({
      where: { expirationDate: { not: null } },
      orderBy: { timestamp: 'desc' },
      select: { productId: true, expirationDate: true },
    }),
    prisma.inventoryTransaction.findMany({
      where: {
        transactionType: { in: [TransactionType.Rescue, TransactionType.Waste] },
      },
      select: {
        timestamp: true,
        qtyChange: true,
        unitCostAtTime: true,
        transactionType: true,
        toLocation: true,
        notes: true,
        referenceId: true,
        product: { select: { retailPrice: true } },
      },
    }),
  ]);

  const onHandById = new Map(sums.map((row) => [row.productId, row._sum.qtyChange ?? 0]));
  const expirationById = new Map<string, Date>();
  for (const row of expirations) {
    if (!expirationById.has(row.productId) && row.expirationDate) {
      expirationById.set(row.productId, row.expirationDate);
    }
  }

  let inventoryValue = 0;
  let expiringWithin48h = 0;
  const alerts = new Map<string, DepartmentAlert>();
  for (const department of Object.keys(DEPARTMENT_LABELS)) {
    alerts.set(department, { department: DEPARTMENT_LABELS[department], low: 0, expiring: 0 });
  }

  for (const product of products) {
    const onHand = onHandById.get(product.id) ?? 0;
    const pack = product.casePackSize && product.casePackSize > 0 ? product.casePackSize : 1;
    const unitCost = product.standardCost && product.standardCost > 0 ? product.standardCost : 0;
    if (onHand > 0) inventoryValue += onHand * unitCost;

    const bucket = alerts.get(product.department);
    if (!bucket || onHand <= 0) continue;

    const parUnits = (product.parCases ?? 2) * pack;
    if (onHand < parUnits) bucket.low += 1;

    const expiration = expirationById.get(product.id);
    if (expiration && expiration.getTime() <= horizon.getTime()) {
      expiringWithin48h += 1;
      bucket.expiring += 1;
    }
  }

  let rescuedValue = 0;
  let discardValue = 0;
  let rescuedUnits = 0;
  let discardedUnits = 0;
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return {
      key: dayKey(date),
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      lost: 0,
      recovered: 0,
    };
  });
  const dayIndex = new Map(days.map((day, index) => [day.key, index]));

  for (const movement of movements) {
    const units = Math.abs(movement.qtyChange);
    if (!(units > 0)) continue;
    const retail = unitRetail(movement.product.retailPrice, movement.unitCostAtTime);
    const amount = units * retail;
    const isRescue =
      movement.transactionType === TransactionType.Rescue &&
      movement.toLocation === InventoryLocation.Kitchen_Prep &&
      movement.qtyChange > 0;
    const isDiscard =
      movement.transactionType === TransactionType.Waste &&
      !movement.referenceId?.startsWith(VOLUMETRIC_SCRAP_REF_PREFIX) &&
      !movement.notes?.toLowerCase().includes('volumetric scrap');

    if (isRescue) {
      rescuedValue += amount;
      rescuedUnits += units;
    } else if (isDiscard) {
      discardValue += amount;
      discardedUnits += units;
    } else {
      continue;
    }

    const index = dayIndex.get(dayKey(movement.timestamp));
    if (index === undefined) continue;
    if (isRescue) days[index].recovered += amount;
    if (isDiscard) days[index].lost += amount;
  }

  const handled = rescuedValue + discardValue;
  const wasteReductionPct = handled > 0 ? Number(((rescuedValue / handled) * 100).toFixed(1)) : null;

  return {
    rescuedValue: money(rescuedValue),
    expiringWithin48h,
    inventoryValue: money(inventoryValue),
    wasteReductionPct,
    rescueVsDiscard: [
      { name: 'Kitchen rescue', units: Number(rescuedUnits.toFixed(2)) },
      { name: 'Discard', units: Number(discardedUnits.toFixed(2)) },
    ],
    revenueDays: days.map((day) => ({
      label: day.label,
      lost: money(day.lost),
      recovered: money(day.recovered),
    })),
    departmentAlerts: Array.from(alerts.values()),
  };
}
