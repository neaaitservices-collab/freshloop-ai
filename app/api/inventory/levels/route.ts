import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireSessionUser } from '@/lib/auth/session';
import { isManager } from '@/lib/utils/roles';
import {
  applyRetailMarkdown,
  getStockLevels,
  moveRetailStock,
  PAR_CASES,
  setParCases,
  setStockCases,
  setSupplier,
  updateCase,
} from '@/lib/domains/inventory/stock';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const levels = await getStockLevels();
    const low = levels.filter((row) => row.low);
    return NextResponse.json({
      success: true,
      parCases: PAR_CASES,
      count: levels.length,
      lowCount: low.length,
      orderCost: Number(low.reduce((sum, row) => sum + row.orderCost, 0).toFixed(2)),
      levels,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Stock levels could not be read.',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireSessionUser();
    const body = (await req.json()) as {
      productId?: string;
      action?: 'rescue' | 'waste' | 'markdown';
      parCases?: number;
      supplier?: string;
      packSize?: number;
      yieldDivisor?: number;
      retailUnit?: string;
      retailPrice?: number;
      casesOnHand?: number;
      role?: string;
      staffId?: string;
      quantity?: number;
      discountPct?: number;
    };
    const productId = body.productId?.trim() ?? '';
    if (!productId) {
      return NextResponse.json({ success: false, error: 'productId is required.' }, { status: 400 });
    }

    if (body.action === 'markdown') {
      const discountPct =
        typeof body.discountPct === 'number' && Number.isFinite(body.discountPct)
          ? body.discountPct
          : 30;
      const marked = await applyRetailMarkdown(productId, actor.id, discountPct);
      return NextResponse.json({ success: true, action: 'markdown', level: marked.level });
    }
    if (body.action === 'rescue' || body.action === 'waste') {
      const moved = await moveRetailStock(
        productId,
        body.action,
        actor.id,
        body.quantity
      );
      return NextResponse.json({
        success: true,
        action: body.action,
        level: moved.level,
        units: moved.units,
        retailFloorQty: moved.level.onHand,
        kitchenPrepQty: moved.level.kitchenPrepQty,
      });
    }

    if (body.casesOnHand !== undefined) {
      if (!isManager(actor.role)) {
        return NextResponse.json(
          { success: false, error: 'Only an admin or store manager can change stock.' },
          { status: 403 }
        );
      }
      const casesOnHand = Number(body.casesOnHand);
      if (!Number.isFinite(casesOnHand) || casesOnHand < 0) {
        return NextResponse.json({ success: false, error: 'Cases must be zero or greater.' }, { status: 400 });
      }
      const level = await setStockCases(productId, casesOnHand, actor.id);
      return NextResponse.json({ success: true, level });
    }
    if (typeof body.supplier === 'string') {
      const level = await setSupplier(productId, body.supplier);
      return NextResponse.json({ success: true, level });
    }
    if (body.packSize !== undefined) {
      const packSize = Number(body.packSize);
      const yieldDivisor = Number(body.yieldDivisor);
      const retailPrice = Number(body.retailPrice);
      if (![packSize, yieldDivisor, retailPrice].every(Number.isFinite)) {
        return NextResponse.json({ success: false, error: 'Case numbers must be finite.' }, { status: 400 });
      }
      const level = await updateCase({
        productId,
        packSize,
        yieldDivisor,
        retailUnit: body.retailUnit ?? 'units',
        retailPrice,
      });
      return NextResponse.json({ success: true, level });
    }
    if (body.parCases !== undefined) {
      const parCases = Number(body.parCases);
      if (!Number.isFinite(parCases)) {
        return NextResponse.json({ success: false, error: 'parCases must be a number.' }, { status: 400 });
      }
      const level = await setParCases(productId, parCases);
      return NextResponse.json({ success: true, level });
    }

    return NextResponse.json(
      { success: false, error: 'Provide parCases, supplier, case fields, casesOnHand, or action (rescue|waste|markdown).' },
      { status: 400 }
    );
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'The alert level could not be saved.');
  }
}
