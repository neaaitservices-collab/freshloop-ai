import { NextRequest, NextResponse } from 'next/server';
import { InventoryLocation } from '@prisma/client';
import { getInventoryItems, updateInventoryItem } from '@/lib/db';
import {
  prisma,
  getCurrentStock,
  getMovingAverageCost,
  calculateRealTimeWastePct,
} from '@/lib/inventory';

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

    // 1. Existing compatible items list
    const items = await getInventoryItems({
      status,
      pullThresholdDays: pullDays,
    });

    // 2. Attempt live Phase 2 Ledger & Waste KPI aggregation from Prisma
    let liveLedger = null;
    try {
      const products = await prisma.product.findMany({
        orderBy: { name: 'asc' },
      });

      if (products.length > 0) {
        const wasteKpi = await calculateRealTimeWastePct({
          additionalScrapBuckets,
        });

        const subInventoryRows = await Promise.all(
          products.map(async (prod) => {
            const [retailStock, kitchenStock, movingAvgCost, latestTx] =
              await Promise.all([
                getCurrentStock(prod.id, InventoryLocation.Retail_Floor),
                getCurrentStock(prod.id, InventoryLocation.Kitchen_Prep),
                getMovingAverageCost(prod.id),
                prisma.inventoryTransaction.findFirst({
                  where: {
                    productId: prod.id,
                    expirationDate: { not: null },
                  },
                  orderBy: { timestamp: 'desc' },
                  select: { expirationDate: true, timestamp: true },
                }),
              ]);

            const now = new Date();
            const expDate = latestTx?.expirationDate
              ? new Date(latestTx.expirationDate)
              : new Date(
                  now.getTime() + prod.shelfLifeDays * 24 * 60 * 60 * 1000
                );
            const daysRemaining = Math.max(
              0,
              Math.ceil(
                (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
              )
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
          })
        );

        liveLedger = {
          wasteKpi,
          subInventoryRows,
        };
      }
    } catch {
      // Fallback handled on client if DB is not yet migrated/seeded
    }

    return NextResponse.json({
      success: true,
      count: items.length,
      items,
      liveLedger,
    });
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
  try {
    const body = await req.json();
    const { id, updates } = body;

    if (!id || !updates) {
      return NextResponse.json(
        { error: 'Missing id or updates parameter' },
        { status: 400 }
      );
    }

    const updated = await updateInventoryItem(id, updates);
    if (!updated) {
      return NextResponse.json(
        { error: 'Inventory item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, item: updated });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to update inventory',
      },
      { status: 500 }
    );
  }
}
