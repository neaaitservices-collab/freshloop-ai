import { NextRequest, NextResponse } from 'next/server';
import { InventoryLocation } from '@prisma/client';
import { getInventoryItems } from '@/lib/legacy/db';
import {
  prisma,
  calculateRealTimeWastePct,
} from '@/lib/domains/inventory/ledger';
import { rememberLedgerRead } from '@/lib/domains/inventory/ledgerCache';

const INVENTORY_CACHE_MS = 60_000;
const inventoryReads = new Map<string, { at: number; gen: number; value: Promise<InventoryPayload> }>();

interface InventoryPayload {
  success: true;
  count: number;
  items: Awaited<ReturnType<typeof getInventoryItems>>;
  liveLedger: {
    wasteKpi: Awaited<ReturnType<typeof calculateRealTimeWastePct>>;
    subInventoryRows: Array<Record<string, unknown>>;
  } | null;
}

interface CostRow {
  productId: string;
  receiveQty: number;
  receiveCost: number;
  otherQty: number;
  otherCost: number;
}

async function loadInventoryPayload(
  status: string,
  pullDays: number,
  additionalScrapBuckets: number
): Promise<InventoryPayload> {
  const itemsPromise = getInventoryItems({
    status,
    pullThresholdDays: pullDays,
  });

  const ledgerPromise = (async () => {
    const [products, wasteKpi, retailSums, kitchenSums, costs, expirations] = await Promise.all([
      prisma.product.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          barcode: true,
          name: true,
          department: true,
          unitType: true,
          retailPrice: true,
          targetMargin: true,
          yieldPct: true,
          casePackSize: true,
          standardCost: true,
          shelfLifeDays: true,
          supplier: true,
          isManufactured: true,
        },
      }),
      calculateRealTimeWastePct({
        additionalScrapBuckets,
      }),
      prisma.inventoryTransaction.groupBy({
        by: ['productId'],
        where: {
          OR: [
            { toLocation: InventoryLocation.Retail_Floor, qtyChange: { gt: 0 } },
            { fromLocation: InventoryLocation.Retail_Floor, qtyChange: { lt: 0 } },
          ],
        },
        _sum: { qtyChange: true },
      }),
      prisma.inventoryTransaction.groupBy({
        by: ['productId'],
        where: {
          OR: [
            { toLocation: InventoryLocation.Kitchen_Prep, qtyChange: { gt: 0 } },
            { fromLocation: InventoryLocation.Kitchen_Prep, qtyChange: { lt: 0 } },
          ],
        },
        _sum: { qtyChange: true },
      }),
      prisma.$queryRaw<CostRow[]>`
        SELECT
          "Product_ID" AS "productId",
          COALESCE(SUM("Qty_Change") FILTER (WHERE "Transaction_Type" = 'Receive'), 0)::float8 AS "receiveQty",
          COALESCE(SUM("Qty_Change" * "Unit_Cost_At_Time") FILTER (WHERE "Transaction_Type" = 'Receive'), 0)::float8 AS "receiveCost",
          COALESCE(SUM("Qty_Change") FILTER (WHERE "Transaction_Type" <> 'Receive'), 0)::float8 AS "otherQty",
          COALESCE(SUM("Qty_Change" * "Unit_Cost_At_Time") FILTER (WHERE "Transaction_Type" <> 'Receive'), 0)::float8 AS "otherCost"
        FROM "Inventory_Transactions"
        WHERE "Qty_Change" > 0 AND "Unit_Cost_At_Time" >= 0
        GROUP BY "Product_ID"
      `,
      prisma.$queryRaw<Array<{ productId: string; expirationDate: Date }>>`
        SELECT DISTINCT ON ("Product_ID")
          "Product_ID" AS "productId",
          "expirationDate"
        FROM "Inventory_Transactions"
        WHERE "expirationDate" IS NOT NULL
        ORDER BY "Product_ID", "timestamp" DESC
      `,
    ]);
    if (products.length === 0) return null;

    const sumByProduct = (rows: Array<{ productId: string; _sum: { qtyChange: number | null } }>) =>
      new Map(rows.map((row) => [row.productId, row._sum.qtyChange ?? 0]));
    const retailById = sumByProduct(retailSums);
    const kitchenById = sumByProduct(kitchenSums);
    const expirationById = new Map(expirations.map((row) => [row.productId, row.expirationDate]));
    const costById = new Map(costs.map((row) => [row.productId, row]));
    const movingAverage = (productId: string, standardCost: number | null) => {
      const row = costById.get(productId);
      const receiveQty = Number(row?.receiveQty ?? 0);
      const otherQty = Number(row?.otherQty ?? 0);
      const source =
        receiveQty > 0
          ? { cost: Number(row?.receiveCost ?? 0), qty: receiveQty }
          : otherQty > 0
            ? { cost: Number(row?.otherCost ?? 0), qty: otherQty }
            : null;
      if (source && source.qty > 0) return Number((source.cost / source.qty).toFixed(4));
      return Number((standardCost ?? 0).toFixed(4));
    };

    const now = new Date();
    const subInventoryRows = products.map((prod) => {
      const retailStock = Number((retailById.get(prod.id) ?? 0).toFixed(4));
      const kitchenStock = Number((kitchenById.get(prod.id) ?? 0).toFixed(4));
      const movingAvgCost = movingAverage(prod.id, prod.standardCost);
      const latestExpiration = expirationById.get(prod.id);
      const expDate = latestExpiration
        ? new Date(latestExpiration)
        : new Date(now.getTime() + prod.shelfLifeDays * 24 * 60 * 60 * 1000);
      const daysRemaining = Math.max(
        0,
        Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );

      return {
        productId: prod.id,
        barcode: prod.barcode || 'N/A',
        name: prod.name,
        department: prod.department,
        unitType: prod.unitType,
        retailFloorQty: retailStock,
        kitchenPrepQty: kitchenStock,
        movingAvgCost,
        retailPrice: prod.retailPrice || Number((movingAvgCost / (1 - prod.targetMargin)).toFixed(2)),
        targetMarginPct: Number((prod.targetMargin * 100).toFixed(0)),
        yieldPct: prod.yieldPct ?? 100,
        casePackSize: prod.casePackSize || 1,
        standardCost: prod.standardCost,
        daysRemaining,
        expirationDate: expDate.toISOString().split('T')[0],
        supplier: prod.supplier || 'Direct Store Vendor',
        isManufactured: prod.isManufactured,
        isFlaggedForPull: daysRemaining <= pullDays && retailStock > 0,
      };
    });

    return { wasteKpi, subInventoryRows };
  })().catch(() => null);

  const [items, liveLedger] = await Promise.all([itemsPromise, ledgerPromise]);
  return {
    success: true,
    count: items.length,
    items,
    liveLedger,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'ALL';
    const pullDaysParam = searchParams.get('pullDays');
    const scrapBucketsParam = searchParams.get('scrapBuckets');

    const pullDays = pullDaysParam ? parseInt(pullDaysParam, 10) : 3;
    const additionalScrapBuckets = scrapBucketsParam
      ? parseFloat(scrapBucketsParam)
      : 0;
    const key = `${status}:${pullDays}:${additionalScrapBuckets}`;
    const payload = await rememberLedgerRead(inventoryReads, key, INVENTORY_CACHE_MS, () =>
      loadInventoryPayload(status, pullDays, additionalScrapBuckets)
    );

    return NextResponse.json(payload);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load inventory',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error:
        'Legacy floor status updates are retired. Use POST /api/inventory/move with action rescue, waste, or markdown.',
    },
    { status: 410 }
  );
}
