import { NextRequest, NextResponse } from 'next/server';
import { applyRetailMarkdown, moveRetailStock } from '@/lib/stock';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      productId?: string;
      action?: string;
      staffId?: string;
    };
    const productId = body.productId?.trim() ?? '';
    const action = body.action;
    if (!productId) {
      return NextResponse.json({ success: false, error: 'productId is required.' }, { status: 400 });
    }
    if (action === 'markdown') {
      const marked = await applyRetailMarkdown(productId, body.staffId ?? '');
      return NextResponse.json({
        success: true,
        action: 'markdown',
        level: marked.level,
      });
    }
    if (action !== 'waste' && action !== 'rescue') {
      return NextResponse.json(
        {
          success: false,
          error: 'Use action rescue, waste, or markdown.',
        },
        { status: 400 }
      );
    }
    const moved = await moveRetailStock(productId, action, body.staffId ?? '');
    return NextResponse.json({
      success: true,
      action,
      level: moved.level,
      units: moved.units,
      retailFloorQty: moved.level.onHand,
      kitchenPrepQty: moved.level.kitchenPrepQty,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The stock could not be moved.';
    const status = message.includes('not found') || message.includes('Nothing is on the retail floor') ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
