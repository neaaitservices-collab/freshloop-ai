import { NextRequest, NextResponse } from 'next/server';
import { processRecipeFusion } from '@/lib/domains/ai/gemini';
import { getFloorPullFusionItems } from '@/lib/domains/inventory/fusionInventoryView';
import { getKitchenPrepFusionItems } from '@/lib/domains/kitchen/prepToFusionItems';
import { listFusionRecipes, saveFusionRecipe } from '@/lib/domains/kitchen/recipeFusionStore';
import type { InventoryItem } from '@/types';
import { authErrorResponse } from '@/lib/auth/http';
import { requireKitchenStaff } from '@/lib/auth/guardRoute';
import { requireSessionUser } from '@/lib/auth/session';

export async function GET() {
  try {
    await requireSessionUser();
    const recipes = await listFusionRecipes();
    return NextResponse.json({ success: true, recipes });
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : 'Failed to load fusion recipes.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireKitchenStaff();
    const body = await req.json();
    const { itemIds, kitchenPrepProductIds, customCategory, pullDays } = body as {
      itemIds?: string[];
      kitchenPrepProductIds?: string[];
      customCategory?: string;
      pullDays?: number;
    };

    const pullThreshold = Number.isFinite(Number(pullDays)) ? Number(pullDays) : 4;
    let itemsToProcess: InventoryItem[] = [];

    if (kitchenPrepProductIds && Array.isArray(kitchenPrepProductIds) && kitchenPrepProductIds.length > 0) {
      itemsToProcess = await getKitchenPrepFusionItems(kitchenPrepProductIds);
    }

    if (itemsToProcess.length === 0) {
      itemsToProcess = await getKitchenPrepFusionItems();
    }

    if (itemsToProcess.length === 0 && itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
      const [floor, prep] = await Promise.all([
        getFloorPullFusionItems(pullThreshold),
        getKitchenPrepFusionItems(),
      ]);
      const byId = new Map<string, InventoryItem>();
      for (const row of [...floor, ...prep]) {
        byId.set(row.id, row);
      }
      itemsToProcess = itemIds.map((id) => byId.get(id)).filter((row): row is InventoryItem => Boolean(row));
    }

    if (itemsToProcess.length === 0) {
      itemsToProcess = (await getFloorPullFusionItems(pullThreshold)).filter((item) =>
        ['PULL_RESCUE', 'WARNING', 'MARKDOWN'].includes(item.status)
      );
    }

    if (itemsToProcess.length === 0) {
      const [floor, prep] = await Promise.all([
        getFloorPullFusionItems(pullThreshold),
        getKitchenPrepFusionItems(),
      ]);
      itemsToProcess = [...prep, ...floor];
    }

    if (itemsToProcess.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No kitchen prep or short-dated floor stock found on the ledger.',
        },
        { status: 400 }
      );
    }

    const fusionRecipes = await processRecipeFusion(itemsToProcess, customCategory);

    const saved = [];
    for (const recipe of fusionRecipes) {
      saved.push(await saveFusionRecipe(recipe));
    }

    return NextResponse.json({
      success: true,
      data: saved,
      usedItemCount: itemsToProcess.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    console.error('API Error in /api/recipe-fusion:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate recipe fusion.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
