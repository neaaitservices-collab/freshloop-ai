import { NextRequest, NextResponse } from 'next/server';
import { processRecipeFusion } from '@/lib/gemini';
import { getInventoryItems, saveFusionRecipe, getFusionRecipes } from '@/lib/db';
import { InventoryItem } from '@/lib/types';

export async function GET() {
  try {
    const recipes = await getFusionRecipes();
    return NextResponse.json({ success: true, recipes });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load fusion recipes.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { itemIds, customCategory } = body;

    let itemsToProcess: InventoryItem[] = [];

    const allItems = await getInventoryItems();
    if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
      itemsToProcess = allItems.filter(i => itemIds.includes(i.id));
    } else {
      // Pick items with status PULL_RESCUE, WARNING, or MARKDOWN
      itemsToProcess = allItems.filter(i => ['PULL_RESCUE', 'WARNING', 'MARKDOWN'].includes(i.status));
    }

    if (itemsToProcess.length === 0) {
      itemsToProcess = allItems; // fallback if no specific short-dated items
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
    console.error('API Error in /api/recipe-fusion:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate recipe fusion.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
