import { TransactionType } from '@prisma/client';
import { prisma, VOLUMETRIC_SCRAP_REF_PREFIX } from '@/lib/domains/inventory/ledger';
import {
  orderedDepartmentAlerts,
  resolveItemDepartment,
} from '@/lib/domains/catalog/departmentRef';
import { loadDepartmentRefState } from '@/lib/domains/catalog/departmentRefStore';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { calculateRealTimeWastePct } from '@/lib/domains/inventory/ledger';
import { SCRAP_VOLUMETRIC_BUCKET_KIND } from '@/lib/domains/inventory/volumetricScrapLedger';
import { belowParSkus, isBelowPar, outOfStockSkus } from '@/lib/domains/inventory/lowStock';
import { countsAsShortDatedAlert } from '@/lib/domains/orders/orderAlertLink';
import { getStockLevels } from '@/lib/domains/inventory/stock';
import type { AdminPeriodFigures, DepartmentAlert, StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';
import { rescueRatePct } from '@/lib/domains/stats/rescueCards';
import {
  scrapBucketInputsFromSettings,
  scrapTotalsForBucketCount,
} from '@/lib/domains/stats/scrapBucketEconomics';
import { formatCardRangeLabel, formatRangeLabel, last30StoreDays, torontoRange } from '@/lib/domains/stats/storeTime';
import type { StoreInstantRange } from '@/lib/domains/stats/storeTime';
import { fromCents } from '@/lib/utils/money';

export type {
  AdminPeriodFigures,
  DepartmentAlert,
  RescueOutcomeDay,
  RescueSlice,
  RevenueDay,
  StoreStats,
} from '@/lib/domains/stats/storeStatsTypes';

function money(value: number): number {
  return Number(value.toFixed(2));
}

interface RangeDayTotal {
  day: string;
  recovered: number;
  lost: number;
  rescueUnits: number;
  discardUnits: number;
}

interface RangeChartPage {
  totalCount: number;
  totals: RangeDayTotal[];
}

/** Full-range sums by Toronto day. Day totals are SQL aggregates, not a capped row list. */
export async function loadRangeChart(range: StoreInstantRange): Promise<RangeChartPage> {
  const where = {
    transactionType: { in: [TransactionType.Rescue, TransactionType.Waste] },
    timestamp: { gte: range.startUtc, lt: range.endUtc },
  };
  const [totalCount, totals] = await Promise.all([
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
  return {
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

/** Same 60s window as the stock-level cache, so admin and orders do not age out apart. */
const CACHE_MS = 60_000;
const PERIOD_CACHE_MS = 15_000;
let cachedStats: { at: number; value: Promise<StoreStats> } | null = null;
const periodCache = new Map<string, { at: number; value: Promise<AdminPeriodFigures> }>();

export function invalidateStoreStats(): void {
  cachedStats = null;
  periodCache.clear();
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

/**
 * Waste SQL treats `endDate` as inclusive. Chart ranges are half-open, so the
 * waste window stops one millisecond before `endUtc`. No range keeps the
 * default lookback. Inventory value does not use this window.
 */
function wasteKpiOptions(
  transferRange?: StoreInstantRange | null
): { startDate: Date; endDate: Date } | undefined {
  if (!transferRange) return undefined;
  return {
    startDate: transferRange.startUtc,
    endDate: new Date(transferRange.endUtc.getTime() - 1),
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
    calculateRealTimeWastePct(wasteKpiOptions(transferRange)),
  ]);
  return { stats: applyWasteKpiToStoreStats(baseStats, wasteKpi), wasteKpi };
}

/**
 * Day / Week / Month scorecard only: rescued, lost, scraps, and sales.
 * Does not read on-hand inventory, alerts, or the transfer-chart series.
 * Rescue uses the half-open chart window. Scraps and sales use the same
 * inclusive end as calculateRealTimeWastePct (`endUtc - 1ms`).
 */
export function getAdminPeriodFigures(range: StoreInstantRange): Promise<AdminPeriodFigures> {
  const key = `${range.startUtc.toISOString()}|${range.endUtc.toISOString()}`;
  const now = Date.now();
  const hit = periodCache.get(key);
  if (hit && now - hit.at < PERIOD_CACHE_MS) return hit.value;
  const value = loadAdminPeriodFigures(range).catch((error: unknown) => {
    periodCache.delete(key);
    throw error;
  });
  periodCache.set(key, { at: now, value });
  return value;
}

async function loadPeriodRescueTotals(range: StoreInstantRange) {
  const rows = await prisma.$queryRaw<
    Array<{
      recovered: number;
      lost: number;
      rescue_units: number;
      discard_units: number;
    }>
  >`
    SELECT
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
  `;
  const row = rows[0];
  const rescued = Number(row?.recovered ?? 0);
  const lost = Number(row?.lost ?? 0);
  return {
    rescued,
    lost,
    rescueUnits: Number(row?.rescue_units ?? 0),
    discardUnits: Number(row?.discard_units ?? 0),
    rate: rescueRatePct(rescued, lost),
  };
}

async function loadPeriodScrapBuckets(startDate: Date, endDate: Date): Promise<number> {
  const volumetricPrefix = `${VOLUMETRIC_SCRAP_REF_PREFIX}%`;
  const volumetricKind = `%${SCRAP_VOLUMETRIC_BUCKET_KIND}%`;
  const rows = await prisma.$queryRaw<Array<{ buckets: number }>>`
    SELECT COALESCE(SUM(
      CASE
        WHEN "Reference_ID" LIKE ${volumetricPrefix}
          OR COALESCE("notes", '') LIKE ${volumetricKind}
          OR LOWER(COALESCE("notes", '')) LIKE '%volumetric scrap%'
          OR LOWER(COALESCE("notes", '')) LIKE '%cubeta%'
        THEN COALESCE("scrap_bucket_count", ABS("Qty_Change"))
        ELSE 0
      END
    ), 0)::float8 AS buckets
    FROM "Inventory_Transactions"
    WHERE "Transaction_Type" = 'Waste'
      AND "timestamp" >= ${startDate}
      AND "timestamp" <= ${endDate}
  `;
  return Number(rows[0]?.buckets ?? 0);
}

async function loadPeriodSalesCents(startDate: Date, endDate: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ cents: number }>>`
    SELECT COALESCE(SUM(
      CASE
        WHEN "Qty_Change" < 0
          AND "realized_line_revenue" IS NOT NULL
          AND "realized_line_revenue" >= 0
        THEN ROUND(("realized_line_revenue" * 100)::numeric)
        ELSE 0
      END
    ), 0)::float8 AS cents
    FROM "Inventory_Transactions"
    WHERE "timestamp" >= ${startDate}
      AND "timestamp" <= ${endDate}
      AND "Transaction_Type" IN ('Sale', 'POS_Sale')
  `;
  return Number(rows[0]?.cents ?? 0);
}

async function loadAdminPeriodFigures(range: StoreInstantRange): Promise<AdminPeriodFigures> {
  const endDate = new Date(range.endUtc.getTime() - 1);
  const [rescue, bucketUnits, salesCents, setting] = await Promise.all([
    loadPeriodRescueTotals(range),
    loadPeriodScrapBuckets(range.startUtc, endDate),
    loadPeriodSalesCents(range.startUtc, endDate),
    findLatestStoreSetting(),
  ]);
  const scrapInputs = scrapBucketInputsFromSettings({
    scrapBucketVolumeL: setting?.scrapBucketVolumeL ?? 20,
    estimatedWeightPerLiterKg: setting?.estimatedWeightPerLiterKg ?? 0.65,
    defaultScrapCostPerKg: setting?.defaultScrapCostPerKg ?? 3.5,
  });
  const volumetricScrapBucketsCount = Number(bucketUnits.toFixed(2));
  const scrap = scrapTotalsForBucketCount(volumetricScrapBucketsCount, scrapInputs);
  return {
    rescuedValue: money(rescue.rescued),
    lostValue: money(rescue.lost),
    scrapDollars: scrap.totalDollars,
    scrapBuckets: volumetricScrapBucketsCount,
    sales: fromCents(salesCents),
  };
}

async function loadStatProducts(tableReady: boolean) {
  const where = { isManufactured: false, catalogActive: true } as const;
  const select = {
    id: true,
    department: true,
    standardCost: true,
    retailPrice: true,
    casePackSize: true,
    parCases: true,
  } as const;
  if (!tableReady) {
    const rows = await prisma.product.findMany({ where, select });
    return rows.map((row) => ({ ...row, departmentId: null as string | null }));
  }
  try {
    return await prisma.product.findMany({
      where,
      select: { ...select, departmentId: true },
    });
  } catch {
    const rows = await prisma.product.findMany({ where, select });
    return rows.map((row) => ({ ...row, departmentId: null as string | null }));
  }
}

async function loadStoreStats(transferRange?: StoreInstantRange | null): Promise<StoreStats> {
  const now = new Date();
  const rolling = last30StoreDays(now);
  const cardBounds = transferRange ?? torontoRange(rolling.from, rolling.to);
  const departmentState = await loadDepartmentRefState();

  const [products, stockLevels, expirations, setting, pendingCredits, rescueTotals] =
    await Promise.all([
    loadStatProducts(departmentState.ready),
    getStockLevels(),
    prisma.$queryRaw<Array<{ productId: string; expirationDate: Date }>>`
      SELECT DISTINCT ON ("Product_ID")
        "Product_ID" AS "productId",
        "expirationDate"
      FROM "Inventory_Transactions"
      WHERE "expirationDate" IS NOT NULL
      ORDER BY "Product_ID", "timestamp" DESC
    `,
    findLatestStoreSetting(),
    prisma.receivingDisposition.count({
      where: { reason: 'NOT_RECEIVED', status: 'PENDING_CREDIT' },
    }),
    loadPeriodRescueTotals(cardBounds),
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
  const refsById = new Map(departmentState.rows.map((row) => [row.id, row]));
  const resolvedById = new Map(
    products.map((product) => [
      product.id,
      resolveItemDepartment({
        departmentId: product.departmentId,
        enumCode: product.department,
        refsById,
        unavailable: !departmentState.ready,
      }),
    ])
  );
  const slots = orderedDepartmentAlerts({
    rows: departmentState.rows,
    unavailable: !departmentState.ready,
    items: products.map((product) => ({
      departmentId: product.departmentId,
      enumCode: product.department,
    })),
  });
  const alerts = new Map<string, DepartmentAlert>(
    slots.map((slot) => [slot.code, { department: slot.name, code: slot.code, low: 0, expiring: 0 }])
  );

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

    const resolved = resolvedById.get(product.id);
    const departmentCode = resolved?.code ?? product.department;
    let bucket = alerts.get(departmentCode);
    if (!bucket) {
      bucket = {
        department: resolved?.name ?? product.department,
        code: departmentCode,
        low: 0,
        expiring: 0,
      };
      alerts.set(departmentCode, bucket);
    }
    if (level && isBelowPar(level)) bucket.low += 1;

    const expiration = expirationById.get(product.id);
    if (level && level.onHand > 0 && level.daysRemaining <= level.pullDays) pulls += 1;
    if (countsAsShortDatedAlert({ onHand, expirationDate: expiration ?? null }, now)) {
      expiringWithin48h += 1;
      bucket.expiring += 1;
    }
  }

  const cardTotals = rescueTotals;
  const rescuedValue = cardTotals.rescued;
  const discardValue = cardTotals.lost;
  const wasteReductionPct = cardTotals.rate;

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
      { name: 'Production transfers', units: Number(cardTotals.rescueUnits.toFixed(2)) },
      { name: 'Discard', units: Number(cardTotals.discardUnits.toFixed(2)) },
    ],
    // Day buckets only fed the transfer chart. The scorecard and executive KPIs use totals.
    revenueDays: [],
    outcomeDays: [],
    departmentAlerts: [
      ...slots.flatMap((slot) => {
        const bucket = alerts.get(slot.code);
        return bucket ? [bucket] : [];
      }),
      ...Array.from(alerts.entries()).flatMap(([code, bucket]) =>
        slots.some((slot) => slot.code === code) ? [] : [bucket]
      ),
    ],
    transferRangeLabel: transferRange ? formatRangeLabel(transferRange.from, transferRange.to) : null,
    cardRangeLabel: formatCardRangeLabel(cardBounds.from, cardBounds.to),
  };
}
