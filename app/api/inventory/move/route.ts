import { NextRequest, NextResponse } from 'next/server';
import { applyRetailMarkdown, moveKitchenPrepToWaste, moveRetailStock } from '@/lib/domains/inventory/stock';
import { apiError, apiErrorFromUnknown } from '@/lib/domains/ai/apiError';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let body: {
      productId?: string;
      action?: string;
      staffId?: string;
      quantity?: number;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return apiError('Request body must be valid JSON.', 400);
    }
    const productId = body.productId?.trim() ?? '';
    const action = body.action;
    if (!productId) {
      return apiError('productId is required.', 400);
    }
    if (action === 'markdown') {
      const marked = await applyRetailMarkdown(productId, body.staffId ?? '');
      return NextResponse.json({
        success: true,
        action: 'markdown',
        level: marked.level,
      });
    }
    if (action === 'kitchen_waste') {
      const moved = await moveKitchenPrepToWaste(productId, body.staffId ?? '', body.quantity);
      return NextResponse.json({
        success: true,
        action,
        level: moved.level,
        units: moved.units,
        retailFloorQty: moved.level.onHand,
        kitchenPrepQty: moved.level.kitchenPrepQty,
      });
    }
    if (action !== 'waste' && action !== 'rescue') {
      return apiError('Use action rescue, waste, kitchen_waste, or markdown.', 400);
    }
    const moved = await moveRetailStock(
      productId,
      action as 'waste' | 'rescue',
      body.staffId ?? '',
      body.quantity
    );
    return NextResponse.json({
      success: true,
      action,
      level: moved.level,
      units: moved.units,
      retailFloorQty: moved.level.onHand,
      kitchenPrepQty: moved.level.kitchenPrepQty,
    });
  } catch (error) {
    return apiErrorFromUnknown(error, 'The stock could not be moved.');
  }
}
