import {
  Prisma,
  PrismaClient,
  InventoryLocation,
  TransactionType,
  UnitType,
  InventoryTransaction,
} from '@prisma/client';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { SCRAP_VOLUMETRIC_BUCKET_KIND } from '@/lib/domains/inventory/volumetricScrapLedger';
import { consumeLotsFifo, LotAllocationError } from '@/lib/domains/inventory/lots';
import {
  computeWastePct,
  kpiLookbackRange,
  MIN_GROSS_SALES_FOR_WASTE_RATIO,
} from '@/lib/domains/stats/wasteKpi';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';
import {
  describeWasteFormulaBreakdown,
  scrapBucketInputsFromSettings,
  scrapDollarsPerBucket,
  scrapTotalsForBucketCount,
  wasteNumeratorDollars,
} from '@/lib/domains/stats/scrapBucketEconomics';

import { prisma } from '@/lib/db/prisma';
import { rememberLedgerRead } from '@/lib/domains/inventory/ledgerCache';
import {
  allocateBundleRealizedRevenue,
  legacySaleDisclosure,
  sumRecognizedGrossSales,
} from '@/lib/domains/inventory/saleRevenue';

export { prisma } from '@/lib/db/prisma';

// ============================================================================
// Custom Domain Error & Strict Interfaces
// ============================================================================

export class InventoryLedgerError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string = 'LEDGER_ERROR', statusCode: number = 400) {
    super(message);
    this.name = 'InventoryLedgerError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface ExecuteBundleSaleOptions {
  quantitySold?: number;
  staffId?: string;
  fromLocation?: InventoryLocation;
  allowNegativeStock?: boolean;
  /** Join a caller-owned transaction. Caller invalidates caches after commit. */
  db?: Prisma.TransactionClient;
}

export interface ExplodedComponentDeduction {
  productId: string;
  productName: string;
  unitType: UnitType;
  qtyDeducted: number;
  unitCostAtTime: number;
  lineCogs: number;
  transactionId: string;
}

export interface BundleSaleExecutionResult {
  bundleId: string;
  bundleName: string;
  bundleSku: string;
  externalRef: string;
  quantitySold: number;
  bundleGrossRevenue: number;
  totalExplodedCogs: number;
  realizedGrossMarginPct: number;
  deductions: ExplodedComponentDeduction[];
  transactions: InventoryTransaction[];
  executedAt: string;
}

export interface WasteCalculationOptions {
  startDate?: Date;
  endDate?: Date;
  /**
   * Optional additional count of 20L volumetric scrap buckets to include in the calculation
   * on top of any volumetric scrap entries already persisted in Inventory_Transactions.
   */
  additionalScrapBuckets?: number;
}

export interface WasteKpiReport {
  /** Real-time waste percentage (0 - 100), or null when sales data is too thin to ratio */
  wastePct: number | null;
  /** Raw decimal ratio before multiplying by 100, e.g. 0.0214 */
  wasteRatio: number;
  /** Configured store target waste percentage from StoreSetting (e.g. 2.5%) */
  targetWastePct: number;
  /** True if wastePct > targetWastePct */
  isExceedingTarget: boolean;
  /** KPI Traffic Light status for Phase 4 Dashboard */
  trafficLightStatus: 'GREEN' | 'RED_BLINKING';
  /** Monetary value ($) of discrete discarded items (TransactionType.Waste) */
  totalDiscardValue: number;
  /** Monetary value ($) of volumetric kitchen scraps (Buckets * Volume_L * Weight_kg/L * Cost/kg) */
  volumetricScrapValue: number;
  /** Number of volumetric scrap buckets accounted for */
  volumetricScrapBucketsCount: number;
  /** Combined waste numerator: totalDiscardValue + volumetricScrapValue ($) */
  totalWasteValue: number;
  /**
   * Gross sales denominator ($) from Sale and POS_Sale lines that stored
   * realized revenue when they were written. Legacy lines with no recorded
   * price are omitted. Markdown revenue loss is not included.
   */
  grossSalesRevenue: number;
  /** Negative Sale/POS_Sale lines in the window whose original price is unknown. */
  legacyUnpricedSaleCount: number;
  /** Absolute quantity on those legacy lines. */
  legacyUnpricedSaleUnits: number;
  /** Human-readable mathematical audit string */
  formulaBreakdown: string;
  /** Store defaults used to price each volumetric bucket log */
  scrapBucketInputs: {
    volumeL: number;
    densityKgPerL: number;
    costPerKg: number;
    kgPerBucket: number;
    dollarsPerBucket: number;
  };
}

// Prefix used in `referenceId` to distinguish volumetric kitchen scrap bucket logs
export const VOLUMETRIC_SCRAP_REF_PREFIX = 'VOL-SCRAP-BUCKET';

// ============================================================================
// 1. getCurrentStock(productId, location)
// ============================================================================

/**
 * Calculates the real-time stock of a Product strictly from the immutable ledger
 * using Prisma `aggregate({ _sum: { qtyChange: true } })`.
 *
 * - Rule Compliance: Never reads a static stock column.
 * - Location Filtering:
 *   - When `location` is provided (e.g. `Retail_Floor` or `Kitchen_Prep`), sums all
 *     positive inflows (`toLocation = location AND qtyChange > 0`) and negative outflows
 *     (`fromLocation = location AND qtyChange < 0`) in a single Prisma SUM aggregation.
 *   - When `location` is omitted, sums `qtyChange` across all store locations.
 */
/** Floor + deli on-hand in one aggregation (admin case override hot path). */
export async function readShelfOnHandPair(
  productId: string,
  client: Prisma.TransactionClient | PrismaClient = prisma
): Promise<{ floor: number; deli: number }> {
  const rows = await client.$queryRaw<Array<{ floor: number; deli: number }>>`
    SELECT
      COALESCE(SUM(
        CASE
          WHEN t."To_Location" = 'Retail_Floor'::"InventoryLocation" AND t."Qty_Change" > 0 THEN t."Qty_Change"
          WHEN t."From_Location" = 'Retail_Floor'::"InventoryLocation" AND t."Qty_Change" < 0 THEN t."Qty_Change"
          ELSE 0
        END
      ), 0)::float8 AS floor,
      COALESCE(SUM(
        CASE
          WHEN t."To_Location" = 'Deli_Grab_N_Go'::"InventoryLocation" AND t."Qty_Change" > 0 THEN t."Qty_Change"
          WHEN t."From_Location" = 'Deli_Grab_N_Go'::"InventoryLocation" AND t."Qty_Change" < 0 THEN t."Qty_Change"
          ELSE 0
        END
      ), 0)::float8 AS deli
    FROM "Inventory_Transactions" t
    WHERE t."Product_ID" = ${productId.trim()}
  `;
  const row = rows[0];
  return {
    floor: Number((row?.floor ?? 0).toFixed(4)),
    deli: Number((row?.deli ?? 0).toFixed(4)),
  };
}

export async function getCurrentStock(
  productId: string,
  location?: InventoryLocation,
  client: Prisma.TransactionClient | PrismaClient = prisma
): Promise<number> {
  if (!productId || typeof productId !== 'string' || !productId.trim()) {
    throw new InventoryLedgerError(
      'A valid productId is required to calculate current stock.',
      'INVALID_PRODUCT_ID',
      400
    );
  }

  try {
    const aggregation = await client.inventoryTransaction.aggregate({
      where: location
        ? {
            productId: productId.trim(),
            OR: [
              // Inflows entering this specific location
              { toLocation: location, qtyChange: { gt: 0 } },
              // Outflows leaving this specific location
              { fromLocation: location, qtyChange: { lt: 0 } },
            ],
          }
        : {
            productId: productId.trim(),
          },
      _sum: {
        qtyChange: true,
      },
    });

    const rawStock = aggregation._sum.qtyChange ?? 0;
    return Number(rawStock.toFixed(4));
  } catch (error) {
    if (error instanceof InventoryLedgerError) throw error;
    throw new InventoryLedgerError(
      `Failed to aggregate ledger stock for product "${productId}"${
        location ? ` at location "${location}"` : ''
      }: ${error instanceof Error ? error.message : String(error)}`,
      'STOCK_AGGREGATION_FAILED',
      500
    );
  }
}

// ============================================================================
// 2. getMovingAverageCost(productId)
// ============================================================================

/**
 * Computes the dynamic Weighted Moving Average Cost (MAC) per unit for a Product
 * based on historical `Receive` transactions in `InventoryTransaction`.
 *
 * Formula:
 *   MAC = SUM(qtyChange_i * unitCostAtTime_i) / SUM(qtyChange_i)
 *   for all transactions where Transaction_Type = 'Receive' and Qty_Change > 0.
 *
 * Fallback hierarchy if no `Receive` logs exist yet:
 *   1. Positive manufacturing/rescue inflows with a positive `unitCostAtTime`.
 *   2. The product's baseline `standardCost` in the `Product` catalog.
 */
export async function getMovingAverageCost(
  productId: string,
  client: Prisma.TransactionClient | PrismaClient = prisma
): Promise<number> {
  if (!productId || typeof productId !== 'string' || !productId.trim()) {
    throw new InventoryLedgerError(
      'A valid productId is required to calculate moving average cost.',
      'INVALID_PRODUCT_ID',
      400
    );
  }

  const normalizedProductId = productId.trim();

  try {
    // Fetch historical reception logs for this product
    const receiveLogs = await client.inventoryTransaction.findMany({
      where: {
        productId: normalizedProductId,
        transactionType: TransactionType.Receive,
        qtyChange: { gt: 0 },
      },
      select: {
        qtyChange: true,
        unitCostAtTime: true,
      },
      orderBy: {
        timestamp: 'asc',
      },
    });

    if (receiveLogs.length > 0) {
      let totalHistoricalCost = 0;
      let totalHistoricalQty = 0;

      for (const log of receiveLogs) {
        if (log.qtyChange > 0 && log.unitCostAtTime >= 0) {
          totalHistoricalCost += log.qtyChange * log.unitCostAtTime;
          totalHistoricalQty += log.qtyChange;
        }
      }

      if (totalHistoricalQty > 0) {
        const weightedAverage = totalHistoricalCost / totalHistoricalQty;
        return Number(weightedAverage.toFixed(4));
      }
    }

    // Secondary check: positive inflows from Kitchen Manufacturing / Rescue batches
    const positiveInflows = await client.inventoryTransaction.findMany({
      where: {
        productId: normalizedProductId,
        qtyChange: { gt: 0 },
        unitCostAtTime: { gt: 0 },
      },
      select: {
        qtyChange: true,
        unitCostAtTime: true,
      },
    });

    if (positiveInflows.length > 0) {
      let totalCost = 0;
      let totalQty = 0;
      for (const inflow of positiveInflows) {
        totalCost += inflow.qtyChange * inflow.unitCostAtTime;
        totalQty += inflow.qtyChange;
      }
      if (totalQty > 0) {
        return Number((totalCost / totalQty).toFixed(4));
      }
    }

    // Final fallback: Product catalog standardCost
    const product = await client.product.findUnique({
      where: { id: normalizedProductId },
      select: { id: true, standardCost: true },
    });

    if (!product) {
      throw new InventoryLedgerError(
        `Product "${normalizedProductId}" does not exist in catalog.`,
        'PRODUCT_NOT_FOUND',
        404
      );
    }

    return Number((product.standardCost ?? 0).toFixed(4));
  } catch (error) {
    if (error instanceof InventoryLedgerError) throw error;
    throw new InventoryLedgerError(
      `Failed to compute moving average cost for product "${normalizedProductId}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      'MAC_CALCULATION_FAILED',
      500
    );
  }
}

/** Batch MAC for invoice guardrails (one receive query + one product fallback query). */
export async function getMovingAverageCostMap(
  productIds: string[],
  client: Prisma.TransactionClient | PrismaClient = prisma
): Promise<Map<string, number>> {
  const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
  const result = new Map<string, number>();
  if (ids.length === 0) return result;

  const receiveLogs = await client.inventoryTransaction.findMany({
    where: {
      productId: { in: ids },
      transactionType: TransactionType.Receive,
      qtyChange: { gt: 0 },
    },
    select: {
      productId: true,
      qtyChange: true,
      unitCostAtTime: true,
    },
  });

  const buckets = new Map<string, { cost: number; qty: number }>();
  for (const log of receiveLogs) {
    if (!(log.qtyChange > 0) || log.unitCostAtTime < 0) continue;
    const prev = buckets.get(log.productId) ?? { cost: 0, qty: 0 };
    prev.cost += log.qtyChange * log.unitCostAtTime;
    prev.qty += log.qtyChange;
    buckets.set(log.productId, prev);
  }

  for (const [productId, bucket] of buckets) {
    if (bucket.qty > 0) {
      result.set(productId, Number((bucket.cost / bucket.qty).toFixed(4)));
    }
  }

  const missing = ids.filter((id) => !result.has(id));
  if (missing.length > 0) {
    const products = await client.product.findMany({
      where: { id: { in: missing } },
      select: { id: true, standardCost: true },
    });
    for (const product of products) {
      result.set(product.id, Number((product.standardCost ?? 0).toFixed(4)));
    }
  }

  return result;
}

// ============================================================================
// 3. executeBundleSale(bundleId, externalRef, options)
// ============================================================================

/**
 * Virtual Kitting "Explode" Engine:
 * When a Bundle is sold at the POS, it does not deduct a static bundle inventory.
 * Instead, it explodes the `Bundle` into its raw `BundleItem` components and atomically
 * records negative `POS_Sale` transactions in `InventoryTransaction` for each raw product.
 *
 * @param bundleId    Internal `Bundle.id` OR `Bundle.bundleSku`
 * @param externalRef External POS receipt/transaction reference (optional)
 * @param options     Optional quantity multiplier, staffId, or source location
 */
export async function executeBundleSale(
  bundleId: string,
  externalRef?: string,
  options?: ExecuteBundleSaleOptions
): Promise<BundleSaleExecutionResult> {
  if (!bundleId || typeof bundleId !== 'string' || !bundleId.trim()) {
    throw new InventoryLedgerError(
      'A valid bundleId or bundleSku is required to execute a Virtual Kitting sale.',
      'INVALID_BUNDLE_ID',
      400
    );
  }

  const normalizedIdentifier = bundleId.trim();
  const quantitySold = options?.quantitySold ?? 1;

  if (quantitySold <= 0 || Number.isNaN(quantitySold)) {
    throw new InventoryLedgerError(
      `Bundle quantitySold must be greater than 0 (received: ${quantitySold}).`,
      'INVALID_BUNDLE_QUANTITY',
      400
    );
  }

  const sourceLocation = options?.fromLocation ?? InventoryLocation.Retail_Floor;
  const staffId = options?.staffId ?? 'POS_VIRTUAL_KITTING';
  const client = options?.db ?? prisma;

  try {
    // 1. Lookup Bundle by ID or SKU along with its component items
    const bundle = await client.bundle.findFirst({
      where: {
        OR: [{ id: normalizedIdentifier }, { bundleSku: normalizedIdentifier }],
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!bundle) {
      throw new InventoryLedgerError(
        `Bundle "${normalizedIdentifier}" was not found.`,
        'BUNDLE_NOT_FOUND',
        404
      );
    }

    if (!bundle.isActive) {
      throw new InventoryLedgerError(
        `Bundle "${bundle.name}" (${bundle.bundleSku}) is currently inactive.`,
        'BUNDLE_INACTIVE',
        422
      );
    }

    if (bundle.items.length === 0) {
      throw new InventoryLedgerError(
        `Bundle "${bundle.name}" (${bundle.bundleSku}) has no component items configured.`,
        'EMPTY_BUNDLE_BOM',
        422
      );
    }

    const referenceCode =
      externalRef?.trim() || `POS-KIT-${bundle.bundleSku}-${Date.now()}`;
    const allowNegative = options?.allowNegativeStock === true;
    const bundleGrossRevenue = Number((bundle.bundlePrice * quantitySold).toFixed(2));

    // 2. Pre-calculate Moving Average Cost (MAC) & optionally verify stock for each component
    const componentPlans: Array<{
      productId: string;
      productName: string;
      unitType: UnitType;
      qtyToDeduct: number;
      unitCostAtTime: number;
      lineCogs: number;
      retailPrice: number | null;
      standardCost: number | null;
    }> = [];

    for (const bundleItem of bundle.items) {
      const qtyToDeduct = Number((bundleItem.quantity * quantitySold).toFixed(4));

      const unitCostAtTime = await getMovingAverageCost(bundleItem.productId, client);
      const lineCogs = Number((qtyToDeduct * unitCostAtTime).toFixed(4));

      componentPlans.push({
        productId: bundleItem.productId,
        productName: bundleItem.product.name,
        unitType: bundleItem.product.unitType,
        qtyToDeduct,
        unitCostAtTime,
        lineCogs,
        retailPrice: bundleItem.product.retailPrice,
        standardCost: bundleItem.product.standardCost,
      });
    }

    const realizedRevenue = allocateBundleRealizedRevenue({
      bundlePrice: bundle.bundlePrice,
      quantitySold,
      components: componentPlans.map((plan) => ({
        qty: plan.qtyToDeduct,
        retailPrice: plan.retailPrice,
        standardCost: plan.standardCost,
      })),
    });
    if (realizedRevenue.length !== componentPlans.length) {
      throw new InventoryLedgerError(
        'Bundle revenue allocation did not match component lines.',
        'BUNDLE_REVENUE_ALLOCATION',
        500
      );
    }
    const pricedPlans = componentPlans.map((plan, index) => {
      const recorded = realizedRevenue[index];
      if (!recorded) {
        throw new InventoryLedgerError(
          'Bundle revenue allocation did not match component lines.',
          'BUNDLE_REVENUE_ALLOCATION',
          500
        );
      }
      return { ...plan, recorded };
    });

    // 3. Execute atomic ledger + FIFO lot write for all exploded components.
    // Lock order is product id. The allocation stays on the plan object so the
    // sort cannot attach one component's revenue to another.
    const writeBundle = async (tx: Prisma.TransactionClient) => {
      const rows: InventoryTransaction[] = [];
      const ordered = [...pricedPlans].sort((a, b) => a.productId.localeCompare(b.productId));
      for (const [index, plan] of ordered.entries()) {
        await consumeLotsFifo(tx, {
          productId: plan.productId,
          location: sourceLocation,
          qty: plan.qtyToDeduct,
          allowShort: allowNegative,
        });
        rows.push(
          await tx.inventoryTransaction.create({
            data: {
              productId: plan.productId,
              staffId,
              qtyChange: -Math.abs(plan.qtyToDeduct),
              transactionType: TransactionType.POS_Sale,
              fromLocation: sourceLocation,
              toLocation: InventoryLocation.Customer_Out,
              unitCostAtTime: plan.unitCostAtTime,
              realizedUnitPrice: plan.recorded.realizedUnitPrice,
              realizedLineRevenue: plan.recorded.realizedLineRevenue,
              referenceId: referenceCode,
              extendedRevenue: index === 0 ? bundleGrossRevenue : null,
              notes: `Virtual Kitting Explode [${bundle.bundleSku}]: ${bundle.name} (x${quantitySold})`,
            },
          })
        );
      }
      return rows;
    };

    const createdTransactions = options?.db
      ? await writeBundle(options.db)
      : await prisma.$transaction(writeBundle);
    if (!options?.db) invalidateInventoryCaches();

    // 4. Build execution summary
    const txByProduct = new Map(createdTransactions.map((row) => [row.productId, row]));
    const deductions: ExplodedComponentDeduction[] = componentPlans.map((plan) => ({
      productId: plan.productId,
      productName: plan.productName,
      unitType: plan.unitType,
      qtyDeducted: plan.qtyToDeduct,
      unitCostAtTime: plan.unitCostAtTime,
      lineCogs: plan.lineCogs,
      transactionId: txByProduct.get(plan.productId)?.id ?? '',
    }));

    const totalExplodedCogs = Number(
      deductions.reduce((acc, item) => acc + item.lineCogs, 0).toFixed(2)
    );
    const realizedGrossMarginPct =
      bundleGrossRevenue > 0
        ? Number(
            (((bundleGrossRevenue - totalExplodedCogs) / bundleGrossRevenue) * 100).toFixed(2)
          )
        : 0;

    return {
      bundleId: bundle.id,
      bundleName: bundle.name,
      bundleSku: bundle.bundleSku,
      externalRef: referenceCode,
      quantitySold,
      bundleGrossRevenue,
      totalExplodedCogs,
      realizedGrossMarginPct,
      deductions,
      transactions: createdTransactions,
      executedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof InventoryLedgerError) throw error;
    if (error instanceof LotAllocationError) {
      throw new InventoryLedgerError(error.message, 'INSUFFICIENT_COMPONENT_STOCK', 409);
    }
    throw new InventoryLedgerError(
      `Failed to execute Virtual Kitting sale for bundle "${normalizedIdentifier}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      'BUNDLE_EXECUTION_FAILED',
      500
    );
  }
}

// ============================================================================
// 4. calculateRealTimeWastePct(options)
// ============================================================================

/**
 * Calculates the real-time store waste KPI percentage and traffic-light state
 * strictly following the Master Development Plan formula:
 *
 *   Waste % = ((Valor Total Descarte + Valor Scraps Volumétricos) / Ventas Brutas Totales) * 100
 *
 * Where:
 * - `Valor Total Descarte`: Sum of `|Qty_Change| * Unit_Cost_At_Time` for discrete `Waste` transactions.
 *   This is physical shrink at cost. It is not markdown revenue loss.
 * - `Valor Scraps Volumétricos`: Volumetric kitchen scrap buckets converted via `StoreSetting`
 *   (`Buckets * Scrap_Bucket_Volume_L * Estimated_Weight_Per_Liter_kg * defaultScrapCostPerKg`).
 * - `Ventas Brutas Totales`: Sum of `realized_line_revenue` on negative `Sale` and `POS_Sale`
 *   rows. Legacy rows with a null price are excluded instead of revalued at the current
 *   shelf price. `MarkdownEvent.revenueImpact` is not part of this ratio.
 */
export async function calculateRealTimeWastePct(
  options?: WasteCalculationOptions
): Promise<WasteKpiReport> {
  try {
    const defaultRange = kpiLookbackRange();
    const startDate = options?.startDate ?? defaultRange.startDate;
    const endDate = options?.endDate ?? defaultRange.endDate;
    const volumetricPrefix = `${VOLUMETRIC_SCRAP_REF_PREFIX}%`;
    const volumetricKind = `%${SCRAP_VOLUMETRIC_BUCKET_KIND}%`;
    const wasteTimeSql = Prisma.sql`AND "timestamp" >= ${startDate} AND "timestamp" <= ${endDate}`;

    const [storeSetting, wasteAggRows, saleLines] = await Promise.all([
      findLatestStoreSetting(),
      prisma.$queryRaw<Array<{ discardValue: number; bucketUnits: number }>>(Prisma.sql`
        SELECT
          COALESCE(SUM(
            CASE
              WHEN "Reference_ID" LIKE ${volumetricPrefix}
                OR COALESCE("notes", '') LIKE ${volumetricKind}
                OR LOWER(COALESCE("notes", '')) LIKE '%volumetric scrap%'
                OR LOWER(COALESCE("notes", '')) LIKE '%cubeta%'
              THEN 0
              ELSE ABS("Qty_Change") * "Unit_Cost_At_Time"
            END
          ), 0)::float8 AS "discardValue",
          COALESCE(SUM(
            CASE
              WHEN "Reference_ID" LIKE ${volumetricPrefix}
                OR COALESCE("notes", '') LIKE ${volumetricKind}
                OR LOWER(COALESCE("notes", '')) LIKE '%volumetric scrap%'
                OR LOWER(COALESCE("notes", '')) LIKE '%cubeta%'
              THEN COALESCE("scrap_bucket_count", ABS("Qty_Change"))
              ELSE 0
            END
          ), 0)::float8 AS "bucketUnits"
        FROM "Inventory_Transactions"
        WHERE "Transaction_Type" = 'Waste'
        ${wasteTimeSql}
      `),
      prisma.inventoryTransaction.findMany({
        where: {
          transactionType: { in: [TransactionType.Sale, TransactionType.POS_Sale] },
          qtyChange: { lt: 0 },
          timestamp: { gte: startDate, lte: endDate },
        },
        select: {
          transactionType: true,
          qtyChange: true,
          realizedLineRevenue: true,
        },
      }),
    ]);

    const targetWastePct = storeSetting?.targetWastePct ?? 2.5;
    const scrapInputs = scrapBucketInputsFromSettings({
      scrapBucketVolumeL: storeSetting?.scrapBucketVolumeL ?? 20,
      estimatedWeightPerLiterKg: storeSetting?.estimatedWeightPerLiterKg ?? 0.65,
      defaultScrapCostPerKg: storeSetting?.defaultScrapCostPerKg ?? 3.5,
    });
    const costPerScrapBucket = scrapDollarsPerBucket(scrapInputs);

    const wasteAgg = wasteAggRows[0];
    const totalDiscardValue = Number((wasteAgg?.discardValue ?? 0).toFixed(2));
    let volumetricScrapBucketsCount = Number((wasteAgg?.bucketUnits ?? 0).toFixed(2));
    let volumetricScrapValue = scrapTotalsForBucketCount(
      volumetricScrapBucketsCount,
      scrapInputs
    ).totalDollars;

    if (options?.additionalScrapBuckets && options.additionalScrapBuckets > 0) {
      volumetricScrapBucketsCount += options.additionalScrapBuckets;
      volumetricScrapValue = scrapTotalsForBucketCount(
        volumetricScrapBucketsCount,
        scrapInputs
      ).totalDollars;
    }

    const recognizedSales = sumRecognizedGrossSales(saleLines);
    const grossSalesRevenue = recognizedSales.grossSalesRevenue;

    // 4. Apply Master Plan Formula: (Valor Total Descarte + Valor Scraps Volumétricos) / Ventas Brutas Totales
    const roundedDiscardValue = Number(totalDiscardValue.toFixed(2));
    const roundedVolumetricValue = Number(volumetricScrapValue.toFixed(2));
    const totalWasteValue = wasteNumeratorDollars(roundedDiscardValue, roundedVolumetricValue);
    const roundedGrossSales = grossSalesRevenue;

    const wastePct = computeWastePct(totalWasteValue, roundedGrossSales);
    const wasteRatio =
      wastePct === null ? 0 : Number((wastePct / 100).toFixed(4));
    const isExceedingTarget =
      wastePct !== null && wastePct > targetWastePct;
    const trafficLightStatus: 'GREEN' | 'RED_BLINKING' = isExceedingTarget
      ? 'RED_BLINKING'
      : 'GREEN';

    const formulaBreakdown = describeWasteFormulaBreakdown({
      discard: roundedDiscardValue,
      scrap: roundedVolumetricValue,
      sales: roundedGrossSales,
      wastePct,
      targetPct: targetWastePct,
      minSalesForRatio: MIN_GROSS_SALES_FOR_WASTE_RATIO,
    });
    const legacyDisclosure = legacySaleDisclosure(
      recognizedSales.legacyUnpricedSaleCount,
      recognizedSales.legacyUnpricedSaleUnits
    );

    const econ = scrapTotalsForBucketCount(1, scrapInputs);

    return {
      wastePct,
      wasteRatio: Number(wasteRatio.toFixed(4)),
      targetWastePct,
      isExceedingTarget,
      trafficLightStatus,
      totalDiscardValue: roundedDiscardValue,
      volumetricScrapValue: roundedVolumetricValue,
      volumetricScrapBucketsCount: Number(volumetricScrapBucketsCount.toFixed(2)),
      totalWasteValue,
      grossSalesRevenue: roundedGrossSales,
      legacyUnpricedSaleCount: recognizedSales.legacyUnpricedSaleCount,
      legacyUnpricedSaleUnits: recognizedSales.legacyUnpricedSaleUnits,
      formulaBreakdown: legacyDisclosure
        ? `${formulaBreakdown} ${legacyDisclosure}`
        : formulaBreakdown,
      scrapBucketInputs: {
        volumeL: scrapInputs.volumeL,
        densityKgPerL: scrapInputs.densityKgPerL,
        costPerKg: scrapInputs.costPerKg,
        kgPerBucket: econ.totalKg,
        dollarsPerBucket: costPerScrapBucket,
      },
    };
  } catch (error) {
    if (error instanceof InventoryLedgerError) throw error;
    throw new InventoryLedgerError(
      `Failed to calculate real-time waste percentage: ${
        error instanceof Error ? error.message : String(error)
      }`,
      'WASTE_CALCULATION_FAILED',
      500
    );
  }
}

const wasteKpiCache = new Map<
  string,
  { at: number; gen: number; value: Promise<WasteKpiReport> }
>();
const WASTE_KPI_CACHE_MS = 30_000;

/** Default KPI window only — custom date ranges bypass cache. */
export function getCachedRealTimeWastePct(): Promise<WasteKpiReport> {
  return rememberLedgerRead(wasteKpiCache, 'waste-kpi-default', WASTE_KPI_CACHE_MS, () =>
    calculateRealTimeWastePct()
  );
}
