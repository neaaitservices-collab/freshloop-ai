import { NextRequest, NextResponse } from 'next/server';
import {
  prisma,
  calculateRealTimeWastePct,
  getCachedRealTimeWastePct,
} from '@/lib/domains/inventory/ledger';
import { getLedgerInventoryItems } from '@/lib/domains/inventory/fusionInventoryView';
import {
  hasKitchenPrepStock,
  hasRetailFloorStock,
} from '@/lib/domains/inventory/subInventoryView';
import { getStockLevels } from '@/lib/domains/inventory/stock';
import { rememberLedgerRead } from '@/lib/domains/inventory/ledgerCache';
import { handleApiRouteError } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireSessionUser } from '@/lib/auth/session';

const INVENTORY_CACHE_MS = 60_000;
const inventoryReads = new Map<string, { at: number; gen: number; value: Promise<InventoryPayload> }>();

interface InventoryPayload {
  success: true;
  count: number;
  items: Awaited<ReturnType<typeof getLedgerInventoryItems>>;
  liveLedger: {
    wasteKpi: Awaited<ReturnType<typeof calculateRealTimeWastePct>>;
    subInventoryRows: Array<Record<string, unknown>>;
  } | null;
}

async function loadInventoryPayload(
  status: string,
  pullDays: number,
  additionalScrapBuckets: number
): Promise<InventoryPayload> {
  const itemsPromise = getLedgerInventoryItems({
    status,
    pullThresholdDays: pullDays,
  });

  const ledgerPromise = (async () => {
    const wasteKpiPromise =
      additionalScrapBuckets > 0
        ? calculateRealTimeWastePct({ additionalScrapBuckets })
        : getCachedRealTimeWastePct();

    const [products, wasteKpi, stockLevels] = await Promise.all([
      prisma.product.findMany({
        where: { catalogActive: true, isManufactured: false },
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
      wasteKpiPromise,
      getStockLevels(),
    ]);
    if (products.length === 0) return null;

    const levelById = new Map(stockLevels.map((row) => [row.productId, row]));
    const now = new Date();

    const subInventoryRows = products
      .map((prod) => {
      const level = levelById.get(prod.id);
      const retailStock = Number((level?.onHand ?? 0).toFixed(4));
      const kitchenStock = Number((level?.kitchenPrepQty ?? 0).toFixed(4));
      const movingAvgCost = Number(
        (level?.unitCost ?? prod.standardCost ?? 0).toFixed(4)
      );
      const daysRemaining =
        level?.daysRemaining ??
        Math.max(
          0,
          Math.ceil(
            (new Date(now.getTime() + prod.shelfLifeDays * 86400000).getTime() - now.getTime()) /
              86400000
          )
        );
      const expDate = new Date(now.getTime() + daysRemaining * 86400000);

      return {
        productId: prod.id,
        barcode: prod.barcode || 'N/A',
        name: prod.name,
        department: prod.department,
        unitType: prod.unitType,
        retailFloorQty: retailStock,
        kitchenPrepQty: kitchenStock,
        movingAvgCost,
        retailPrice:
          level?.retailPrice ??
          prod.retailPrice ??
          Number((movingAvgCost / Math.max(1 - prod.targetMargin, 0.05)).toFixed(2)),
        targetMarginPct: Number((prod.targetMargin * 100).toFixed(0)),
        yieldPct: prod.yieldPct ?? 100,
        casePackSize: prod.casePackSize || 1,
        standardCost: prod.standardCost,
        daysRemaining,
        expirationDate: expDate.toISOString().split('T')[0],
        supplier: prod.supplier || level?.supplier || 'Direct Store Vendor',
        isManufactured: prod.isManufactured,
        isFlaggedForPull:
          daysRemaining <= (level?.pullDays ?? pullDays) && retailStock > 0,
      };
    })
      .filter(
        (row) =>
          hasRetailFloorStock({ onHand: row.retailFloorQty }) ||
          hasKitchenPrepStock({ kitchenPrepQty: row.kitchenPrepQty })
      );

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
    await requireSessionUser();
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
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return handleApiRouteError('GET /api/inventory', error, 'Failed to load inventory.');
  }
}

export async function PATCH() {
  return NextResponse.json(
    {
      success: false,
      error:
        'Legacy floor status updates are retired. Use POST /api/inventory/move with action rescue, waste, or markdown.',
    },
    { status: 410 }
  );
}
