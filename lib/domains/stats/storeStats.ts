import { TransactionType } from '@prisma/client';
import { prisma, VOLUMETRIC_SCRAP_REF_PREFIX } from '@/lib/domains/inventory/ledger';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { calculateRealTimeWastePct } from '@/lib/domains/inventory/ledger';
import { isInboundProductionTransfer } from '@/lib/domains/inventory/kitchenInbox';
import { belowParSkus, isBelowPar, outOfStockSkus } from '@/lib/domains/inventory/lowStock';
import { getStockLevels } from '@/lib/domains/inventory/stock';
import type { DepartmentAlert, StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';
import { DEFAULT_KPI_LOOKBACK_DAYS, kpiLookbackRange } from '@/lib/domains/stats/wasteKpi';
import { RANGE_ROW_LIMIT, rangeIsTruncated } from '@/lib/domains/stats/rangeLimit';
import {
  enumerateYmd,
  formatBucketLabel,
  formatRangeLabel,
  torontoYmd,
  type StoreInstantRange,
} from '@/lib/domains/stats/storeTime';

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

interface RangeDayTotal {
  day: string;
  recovered: number;
  lost: number;
  rescueUnits: number;
  discardUnits: number;
}

interface RangeChartPage {
  truncated: boolean;
  limit: number;
  totalCount: number;
  totals: RangeDayTotal[];
}

/** Full-range sums by Toronto day. The row list is capped separately and does not feed these totals. */
export async function loadRangeChart(
  range: StoreInstantRange,
  limit = RANGE_ROW_LIMIT
): Promise<RangeChartPage> {
  const where = {
    transactionType: { in: [TransactionType.Rescue, TransactionType.Waste] },
    timestamp: { gte: range.startUtc, lt: range.endUtc },
  };
  const [listed, totalCount, totals] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      select: { id: true },
    }),
    prisma.inventoryTransaction.count({ where }),
    prisma.$queryRaw<
      Array<{
        day: string;
        recovered: number;
        lost: number;
        rescue_units: number;
        discard_units: number;
      }>
    >`
      SELECT
        to_char(t."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Toronto', 'YYYY-MM-DD') AS day,
        COALESCE(SUM(
          CASE
            WHEN t."Transaction_Type" = 'Rescue'
              AND t."To_Location" = 'Kitchen_Prep'
              AND t."Qty_Change" > 0
            THEN t."Qty_Change" * (
              CASE
                WHEN p."retailPrice" IS NOT NULL AND p."retailPrice" > 0 THEN p."retailPrice"
                WHEN t."Unit_Cost_At_Time" > 0 THEN t."Unit_Cost_At_Time"
                ELSE 0
              END
            )
            ELSE 0
          END
        ), 0)::float8 AS recovered,
        COALESCE(SUM(
          CASE
            WHEN t."Transaction_Type" = 'Waste'
              AND (t."Reference_ID" IS NULL OR t."Reference_ID" NOT LIKE ${`${VOLUMETRIC_SCRAP_REF_PREFIX}%`})
              AND (
                t.notes IS NULL
                OR (
                  position('volumetric scrap' in lower(t.notes)) = 0
                  AND position('cubeta' in lower(t.notes)) = 0
                )
              )
            THEN abs(t."Qty_Change") * (
              CASE
                WHEN p."retailPrice" IS NOT NULL AND p."retailPrice" > 0 THEN p."retailPrice"
                WHEN t."Unit_Cost_At_Time" > 0 THEN t."Unit_Cost_At_Time"
                ELSE 0
              END
            )
            ELSE 0
          END
        ), 0)::float8 AS lost,
        COALESCE(SUM(
          CASE
            WHEN t."Transaction_Type" = 'Rescue'
              AND t."To_Location" = 'Kitchen_Prep'
              AND t."Qty_Change" > 0
            THEN t."Qty_Change"
            ELSE 0
          END
        ), 0)::float8 AS rescue_units,
        COALESCE(SUM(
          CASE
            WHEN t."Transaction_Type" = 'Waste'
              AND (t."Reference_ID" IS NULL OR t."Reference_ID" NOT LIKE ${`${VOLUMETRIC_SCRAP_REF_PREFIX}%`})
              AND (
                t.notes IS NULL
                OR (
                  position('volumetric scrap' in lower(t.notes)) = 0
                  AND position('cubeta' in lower(t.notes)) = 0
                )
              )
            THEN abs(t."Qty_Change")
            ELSE 0
          END
        ), 0)::float8 AS discard_units
      FROM "Inventory_Transactions" t
      JOIN products p ON p.id = t."Product_ID"
      WHERE t."timestamp" >= ${range.startUtc}
        AND t."timestamp" < ${range.endUtc}
        AND t."Transaction_Type" IN ('Rescue', 'Waste')
      GROUP BY 1
    `,
  ]);
  if (listed.length > limit) {
    throw new Error('Date range list exceeded its row cap.');
  }
  return {
    truncated: rangeIsTruncated(totalCount, limit),
    limit,
    totalCount,
    totals: totals.map((row) => ({
      day: row.day,
      recovered: Number(row.recovered),
      lost: Number(row.lost),
      rescueUnits: Number(row.rescue_units),
      discardUnits: Number(row.discard_units),
    })),
  };
}

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Same 60s window as the stock-level cache, so admin and orders do not age out apart. */
const CACHE_MS = 60_000;
let cachedStats: { at: number; value: Promise<StoreStats> } | null = null;

export function invalidateStoreStats(): void {
  cachedStats = null;
}

export function getStoreStats(transferRange?: StoreInstantRange | null): Promise<StoreStats> {
  if (transferRange) return loadStoreStats(transferRange);
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
export async function getAdminStoreStatsBundle(
  transferRange?: StoreInstantRange | null
): Promise<{
  stats: StoreStats;
  wasteKpi: WasteKpiReport;
}> {
  const [baseStats, wasteKpi] = await Promise.all([
    getStoreStats(transferRange),
    calculateRealTimeWastePct(),
  ]);
  return { stats: applyWasteKpiToStoreStats(baseStats, wasteKpi), wasteKpi };
}

async function loadStoreStats(transferRange?: StoreInstantRange | null): Promise<StoreStats> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const { startDate: lookbackStart, endDate: lookbackEnd } = kpiLookbackRange(
    DEFAULT_KPI_LOOKBACK_DAYS,
    now
  );

  const [products, stockLevels, expirations, movements, setting, pendingCredits, chartWindow] =
    await Promise.all([
    prisma.product.findMany({
      where: { isManufactured: false, catalogActive: true },
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
    prisma.receivingDisposition.count({
      where: { reason: 'NOT_RECEIVED', status: 'PENDING_CREDIT' },
    }),
    transferRange ? loadRangeChart(transferRange) : Promise.resolve(null),
  ]);

  const levelById = new Map(stockLevels.map((row) => [row.productId, row]));
  const expirationById = new Map(expirations.map((row) => [row.productId, row.expirationDate]));

  let inventoryValue = 0;
  let expiringWithin48h = 0;
  let pulls = 0;
  const pullSensitivityDays =
    setting?.pullSensitivityDays === 2 ||
    setting?.pullSensitivityDays === 3 ||
    setting?.pullSensitivityDays === 4
      ? setting.pullSensitivityDays
      : 3;
  const alerts = new Map<string, DepartmentAlert>();
  for (const department of Object.keys(DEPARTMENT_LABELS)) {
    alerts.set(department, { department: DEPARTMENT_LABELS[department], low: 0, expiring: 0 });
  }

  for (const product of products) {
    const level = levelById.get(product.id);
    const onHand = level?.onHand ?? 0;
    const unitCost =
      level?.unitCost && level.unitCost > 0
        ? level.unitCost
        : product.standardCost && product.standardCost > 0
          ? product.standardCost
          : 0;
    if (onHand > 0) inventoryValue += onHand * unitCost;

    if (onHand <= 0) continue;

    let bucket = alerts.get(product.department);
    if (!bucket) {
      bucket = {
        department: DEPARTMENT_LABELS[product.department] ?? product.department,
        low: 0,
        expiring: 0,
      };
      alerts.set(product.department, bucket);
    }
    if (level && isBelowPar(level)) bucket.low += 1;

    const expiration = expirationById.get(product.id);
    if (level && level.onHand > 0 && level.daysRemaining <= level.pullDays) pulls += 1;
    if (expiration && expiration.getTime() <= horizon.getTime()) {
      expiringWithin48h += 1;
      bucket.expiring += 1;
    }
  }

  let rescuedValue = 0;
  let discardValue = 0;
  let rescuedUnits = 0;
  let discardedUnits = 0;
  const chartMovements = transferRange ? [] : movements;
  const blankDay = () => ({
    lost: 0,
    recovered: 0,
    rescueUnits: 0,
    discardUnits: 0,
  });
  const legacyDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return {
      key: dayKey(date),
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      ...blankDay(),
    };
  });
  const rangeDays = transferRange
    ? enumerateYmd(transferRange.from, transferRange.to).map((ymd) => ({
        key: ymd,
        label: formatBucketLabel(ymd),
        ...blankDay(),
      }))
    : legacyDays;
  const legacyIndex = new Map(legacyDays.map((day, index) => [day.key, index]));
  const rangeIndex = new Map(rangeDays.map((day, index) => [day.key, index]));

  const scoreMovement = (movement: (typeof movements)[number]) => {
    const units = Math.abs(movement.qtyChange);
    if (!(units > 0)) return null;
    const retail = unitRetail(movement.product.retailPrice, movement.unitCostAtTime);
    const amount = units * retail;
    const isRescue = isInboundProductionTransfer(movement);
    const isDiscard =
      movement.transactionType === TransactionType.Waste &&
      !movement.referenceId?.startsWith(VOLUMETRIC_SCRAP_REF_PREFIX) &&
      !movement.notes?.toLowerCase().includes('volumetric scrap') &&
      !movement.notes?.toLowerCase().includes('cubeta');
    if (!isRescue && !isDiscard) return null;
    return { units, amount, isRescue, isDiscard };
  };

  for (const movement of movements) {
    const scored = scoreMovement(movement);
    if (!scored) continue;
    if (scored.isRescue) {
      rescuedValue += scored.amount;
      rescuedUnits += scored.units;
    } else if (scored.isDiscard) {
      discardValue += scored.amount;
      discardedUnits += scored.units;
    }
  }

  const addToDay = (
    days: typeof legacyDays,
    index: number | undefined,
    scored: NonNullable<ReturnType<typeof scoreMovement>>
  ) => {
    if (index === undefined) return;
    if (scored.isRescue) {
      days[index].recovered += scored.amount;
      days[index].rescueUnits += scored.units;
    }
    if (scored.isDiscard) {
      days[index].lost += scored.amount;
      days[index].discardUnits += scored.units;
    }
  };

  for (const movement of chartMovements) {
    const scored = scoreMovement(movement);
    if (!scored) continue;
    const key = transferRange ? torontoYmd(movement.timestamp) : dayKey(movement.timestamp);
    addToDay(rangeDays, rangeIndex.get(key), scored);
  }
  if (transferRange) {
    for (const movement of movements) {
      const scored = scoreMovement(movement);
      if (!scored) continue;
      addToDay(legacyDays, legacyIndex.get(dayKey(movement.timestamp)), scored);
    }
  }
  if (chartWindow) {
    const byDay = new Map(chartWindow.totals.map((row) => [row.day, row]));
    for (const day of rangeDays) {
      const row = byDay.get(day.key);
      if (!row) continue;
      day.recovered = row.recovered;
      day.lost = row.lost;
      day.rescueUnits = row.rescueUnits;
      day.discardUnits = row.discardUnits;
    }
  }

  const handled = rescuedValue + discardValue;
  const wasteReductionPct = handled > 0 ? Number(((rescuedValue / handled) * 100).toFixed(1)) : null;

  return {
    rescuedValue: money(rescuedValue),
    lostValue: money(discardValue),
    expiringWithin48h,
    inventoryValue: money(inventoryValue),
    wasteReductionPct,
    wastePct: null,
    totalWasteValue: 0,
    grossSalesRevenue: 0,
    targetWastePct: setting?.targetWastePct ?? 2.5,
    pullSensitivityDays,
    pulls,
    lowCount: belowParSkus(stockLevels).length,
    outOfStockCount: outOfStockSkus(stockLevels).length,
    pendingApprovalsCount: pendingCredits,
    rescueVsDiscard: [
      { name: 'Production transfers', units: Number(rescuedUnits.toFixed(2)) },
      { name: 'Discard', units: Number(discardedUnits.toFixed(2)) },
    ],
    revenueDays: legacyDays.map((day) => ({
      label: day.label,
      lost: money(day.lost),
      recovered: money(day.recovered),
    })),
    outcomeDays: rangeDays.map((day) => ({
      label: day.label,
      recoveredUsd: money(day.recovered),
      lostUsd: money(day.lost),
      rescueUnits: Number(day.rescueUnits.toFixed(2)),
      discardUnits: Number(day.discardUnits.toFixed(2)),
    })),
    departmentAlerts: Array.from(alerts.values()),
    transferRangeLabel: transferRange ? formatRangeLabel(transferRange.from, transferRange.to) : null,
    transferRangeTruncated: chartWindow?.truncated ?? false,
    transferRangeRowLimit: chartWindow?.limit ?? null,
  };
}
