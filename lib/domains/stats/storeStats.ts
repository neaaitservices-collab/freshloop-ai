import { InventoryLocation, TransactionType } from '@prisma/client';
import { prisma, VOLUMETRIC_SCRAP_REF_PREFIX } from '@/lib/domains/inventory/ledger';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { calculateRealTimeWastePct } from '@/lib/domains/inventory/ledger';
import { getStockLevels } from '@/lib/domains/inventory/stock';
import type { DepartmentAlert, StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';
import { DEFAULT_KPI_LOOKBACK_DAYS, kpiLookbackRange } from '@/lib/domains/stats/wasteKpi';

export type {
  DepartmentAlert,
  RescueOutcomeDay,
  RescueSlice,
  RevenueDay,
  StoreStats,
} from '@/lib/domains/stats/storeStatsTypes';

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

const CACHE_MS = 20_000;
let cachedStats: { at: number; value: Promise<StoreStats> } | null = null;

export function invalidateStoreStats(): void {
  cachedStats = null;
}

export function getStoreStats(): Promise<StoreStats> {
  const now = Date.now();
  if (cachedStats && now - cachedStats.at < CACHE_MS) return cachedStats.value;
  const value = loadStoreStats().catch((error: unknown) => {
    cachedStats = null;
    throw error;
  });
  cachedStats = { at: now, value };
  return value;
}

/** Attach canonical ledger waste KPI fields (single source of truth). */
export function applyWasteKpiToStoreStats(stats: StoreStats, wasteKpi: WasteKpiReport): StoreStats {
  return {
    ...stats,
    wastePct: wasteKpi.wastePct,
    totalWasteValue: wasteKpi.totalWasteValue,
    grossSalesRevenue: wasteKpi.grossSalesRevenue,
    targetWastePct: wasteKpi.targetWastePct,
  };
}

/** Admin dashboard: inventory/chart stats + live waste KPI in one round-trip. */
export async function getAdminStoreStatsBundle(): Promise<{
  stats: StoreStats;
  wasteKpi: WasteKpiReport;
}> {
  const [baseStats, wasteKpi] = await Promise.all([getStoreStats(), calculateRealTimeWastePct()]);
  return { stats: applyWasteKpiToStoreStats(baseStats, wasteKpi), wasteKpi };
}

async function loadStoreStats(): Promise<StoreStats> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const { startDate: lookbackStart, endDate: lookbackEnd } = kpiLookbackRange(
    DEFAULT_KPI_LOOKBACK_DAYS,
    now
  );

  const [products, stockLevels, expirations, movements, setting] = await Promise.all([
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
    getStockLevels(),
    prisma.$queryRaw<Array<{ productId: string; expirationDate: Date }>>`
      SELECT DISTINCT ON ("Product_ID")
        "Product_ID" AS "productId",
        "expirationDate"
      FROM "Inventory_Transactions"
      WHERE "expirationDate" IS NOT NULL
      ORDER BY "Product_ID", "timestamp" DESC
    `,
    prisma.inventoryTransaction.findMany({
      where: {
        transactionType: { in: [TransactionType.Rescue, TransactionType.Waste] },
        timestamp: { gte: lookbackStart, lte: lookbackEnd },
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
    findLatestStoreSetting(),
  ]);

  const levelById = new Map(stockLevels.map((row) => [row.productId, row]));
  const expirationById = new Map(expirations.map((row) => [row.productId, row.expirationDate]));

  let inventoryValue = 0;
  let expiringWithin48h = 0;
  let pulls = 0;
  let lowCount = 0;
  const pullSensitivityDays =
    setting?.pullSensitivityDays === 2 ||
    setting?.pullSensitivityDays === 3 ||
    setting?.pullSensitivityDays === 4
      ? setting.pullSensitivityDays
      : 3;
  const pullHorizon = new Date(now.getTime() + pullSensitivityDays * 24 * 60 * 60 * 1000);
  const alerts = new Map<string, DepartmentAlert>();
  for (const department of Object.keys(DEPARTMENT_LABELS)) {
    alerts.set(department, { department: DEPARTMENT_LABELS[department], low: 0, expiring: 0 });
  }

  for (const product of products) {
    const level = levelById.get(product.id);
    const onHand = level?.onHand ?? 0;
    const pack = product.casePackSize && product.casePackSize > 0 ? product.casePackSize : 1;
    const unitCost =
      level?.unitCost && level.unitCost > 0
        ? level.unitCost
        : product.standardCost && product.standardCost > 0
          ? product.standardCost
          : 0;
    if (onHand > 0) inventoryValue += onHand * unitCost;

    const bucket = alerts.get(product.department);
    if (!bucket || onHand <= 0) continue;

    const parUnits = level?.parUnits ?? (product.parCases ?? 2) * pack;
    if (onHand < parUnits) {
      bucket.low += 1;
      lowCount += 1;
    }

    const expiration = expirationById.get(product.id);
    if (expiration && expiration.getTime() <= pullHorizon.getTime()) pulls += 1;
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
      rescueUnits: 0,
      discardUnits: 0,
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
      !movement.notes?.toLowerCase().includes('volumetric scrap') &&
      !movement.notes?.toLowerCase().includes('cubeta');

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
    if (isRescue) {
      days[index].recovered += amount;
      days[index].rescueUnits += units;
    }
    if (isDiscard) {
      days[index].lost += amount;
      days[index].discardUnits += units;
    }
  }

  const handled = rescuedValue + discardValue;
  const wasteReductionPct = handled > 0 ? Number(((rescuedValue / handled) * 100).toFixed(1)) : null;

  return {
    rescuedValue: money(rescuedValue),
    expiringWithin48h,
    inventoryValue: money(inventoryValue),
    wasteReductionPct,
    wastePct: null,
    totalWasteValue: 0,
    grossSalesRevenue: 0,
    targetWastePct: setting?.targetWastePct ?? 2.5,
    pullSensitivityDays,
    pulls,
    lowCount,
    rescueVsDiscard: [
      { name: 'Kitchen rescue', units: Number(rescuedUnits.toFixed(2)) },
      { name: 'Discard', units: Number(discardedUnits.toFixed(2)) },
    ],
    revenueDays: days.map((day) => ({
      label: day.label,
      lost: money(day.lost),
      recovered: money(day.recovered),
    })),
    outcomeDays: days.map((day) => ({
      label: day.label,
      recoveredUsd: money(day.recovered),
      lostUsd: money(day.lost),
      rescueUnits: Number(day.rescueUnits.toFixed(2)),
      discardUnits: Number(day.discardUnits.toFixed(2)),
    })),
    departmentAlerts: Array.from(alerts.values()),
  };
}
