import { NextRequest, NextResponse } from 'next/server';
import { AiUnavailableError, processRecipeFusion } from '@/lib/domains/ai/gemini';
import { getFloorPullFusionItems } from '@/lib/domains/inventory/fusionInventoryView';
import { getKitchenPrepFusionItems } from '@/lib/domains/kitchen/prepToFusionItems';
import { createFusionRecipes, listFusionRecipes } from '@/lib/domains/kitchen/recipeFusionStore';
import type { InventoryItem } from '@/types';
import { handleApiRouteError } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireKitchenStaff } from '@/lib/auth/guardRoute';
import { requireSessionUser } from '@/lib/auth/session';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { recipeFusionPostBodySchema } from '@/lib/security/schemas/recipes';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';

export async function GET() {
  try {
    await requireSessionUser();
    const recipes = await listFusionRecipes();
    return NextResponse.json({ success: true, recipes });
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return handleApiRouteError('GET /api/recipe-fusion', error, 'Failed to load fusion recipes.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireKitchenStaff();
    const limited = assertMutationRateLimit(actor.id, 'recipe-fusion', 12);
    if (limited) return limited;

    const body = await parseJsonBody(req, recipeFusionPostBodySchema);
    const { itemIds, kitchenPrepProductIds, customCategory, pullDays } = body;

    const pullThreshold = pullDays ?? 4;
    let itemsToProcess: InventoryItem[] = [];

    if (kitchenPrepProductIds && kitchenPrepProductIds.length > 0) {
      itemsToProcess = await getKitchenPrepFusionItems(kitchenPrepProductIds);
    }

    if (itemsToProcess.length === 0) {
      itemsToProcess = await getKitchenPrepFusionItems();
    }

    if (itemsToProcess.length === 0 && itemIds && itemIds.length > 0) {
      const [floor, prep] = await Promise.all([
        getFloorPullFusionItems(pullThreshold, { productIds: itemIds }),
        getKitchenPrepFusionItems(),
      ]);
      const byId = new Map<string, InventoryItem>();
      for (const row of [...floor, ...prep]) {
        byId.set(row.id, row);
      }
      itemsToProcess = itemIds
        .map((id) => byId.get(id))
        .filter((row): row is InventoryItem => Boolean(row));
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
          error: 'No production prep or short-dated floor stock found on the ledger.',
        },
        { status: 400 }
      );
    }

    const fusionRecipes = await processRecipeFusion(itemsToProcess, customCategory);
    const saved = await createFusionRecipes(fusionRecipes);

    return NextResponse.json({
      success: true,
      data: saved,
      usedItemCount: itemsToProcess.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof AiUnavailableError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return handleApiRouteError(
      'POST /api/recipe-fusion',
      error,
      'Failed to generate recipe fusion. Please try again.'
    );
  }
}
