import { NextRequest, NextResponse } from 'next/server';
import { LotAllocationError } from '@/lib/domains/inventory/lots';
import { applyRetailMarkdown, moveKitchenPrepToWaste, moveRetailStock } from '@/lib/domains/inventory/stock';
import { apiError, apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff, requireOperationalStaff } from '@/lib/auth/guardRoute';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { inventoryMoveBodySchema } from '@/lib/security/schemas/inventory';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const actor = await requireOperationalStaff();
    const limited = assertMutationRateLimit(actor.id, 'inventory-move', 80);
    if (limited) return limited;

    const body = await parseJsonBody(req, inventoryMoveBodySchema);
    const { productId, action } = body;

    if (action === 'markdown') {
      await requireManagerStaff();
      const discountPct = body.discountPct ?? 30;
      const marked = await applyRetailMarkdown(productId, actor.id, discountPct);
      return NextResponse.json({
        success: true,
        action: 'markdown',
        level: marked.level,
      });
    }
    if (action === 'kitchen_waste') {
      const moved = await moveKitchenPrepToWaste(productId, actor.id, body.quantity);
      return NextResponse.json({
        success: true,
        action,
        level: moved.level,
        units: moved.units,
        retailFloorQty: moved.level.onHand,
        kitchenPrepQty: moved.level.kitchenPrepQty,
      });
    }
    const moved = await moveRetailStock(
      productId,
      action,
      actor.id,
      body.quantity,
      body.clientMutationId
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
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    if (error instanceof LotAllocationError) {
      return apiError(error.message, 409);
    }
    return apiErrorFromUnknown(error, 'The stock could not be moved.');
  }
}
