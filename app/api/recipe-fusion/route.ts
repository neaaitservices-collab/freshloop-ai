import { NextRequest, NextResponse } from 'next/server';
import { processRecipeFusion } from '@/lib/domains/ai/gemini';
import { getInventoryItems, saveFusionRecipe, getFusionRecipes } from '@/lib/legacy/db';
import { getKitchenPrepFusionItems } from '@/lib/domains/kitchen/prepToFusionItems';
import type { InventoryItem } from '@/types';
import { authErrorResponse } from '@/lib/auth/http';
import { requireKitchenStaff } from '@/lib/auth/guardRoute';
import { requireSessionUser } from '@/lib/auth/session';

export async function GET() {
  try {
    await requireSessionUser();
    const recipes = await getFusionRecipes();
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
    const { itemIds, kitchenPrepProductIds, customCategory } = body;

    let itemsToProcess: InventoryItem[] = [];

    if (kitchenPrepProductIds && Array.isArray(kitchenPrepProductIds) && kitchenPrepProductIds.length > 0) {
      itemsToProcess = await getKitchenPrepFusionItems(kitchenPrepProductIds);
    }

    if (itemsToProcess.length === 0) {
      itemsToProcess = await getKitchenPrepFusionItems();
    }

    const allItems = await getInventoryItems();
    if (itemsToProcess.length === 0 && itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
      itemsToProcess = allItems.filter((i) => itemIds.includes(i.id));
    }

    if (itemsToProcess.length === 0) {
      itemsToProcess = allItems.filter((i) =>
        ['PULL_RESCUE', 'WARNING', 'MARKDOWN'].includes(i.status)
      );
    }

    if (itemsToProcess.length === 0) {
      itemsToProcess = allItems;
    }

    const fusionRecipes = await processRecipeFusion(itemsToProcess, customCategory);

    // Save recipes to memory/db store
    for (const r of fusionRecipes) {
      await saveFusionRecipe(r);
    }

    return NextResponse.json({
      success: true,
      data: fusionRecipes,
      usedItemCount: itemsToProcess.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    console.error('API Error in /api/recipe-fusion:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate recipe fusion.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
