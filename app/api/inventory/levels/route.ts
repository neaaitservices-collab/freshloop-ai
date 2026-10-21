import { NextRequest, NextResponse } from 'next/server';
import { isManager, isRoleName } from '@/lib/roles';
import { getStockLevels, PAR_CASES, setParCases, setStockCases, setSupplier, updateCase } from '@/lib/stock';

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
    const body = (await req.json()) as {
      productId?: string;
      parCases?: number;
      supplier?: string;
      packSize?: number;
      yieldDivisor?: number;
      retailUnit?: string;
      retailPrice?: number;
      casesOnHand?: number;
      role?: string;
      staffId?: string;
    };
    const productId = body.productId?.trim() ?? '';
    if (!productId) {
      return NextResponse.json({ success: false, error: 'productId is required.' }, { status: 400 });
    }
    if (body.casesOnHand !== undefined) {
      const role = body.role ?? '';
      if (!isRoleName(role) || !isManager(role)) {
        return NextResponse.json(
          { success: false, error: 'Only an admin or store manager can change stock.' },
          { status: 403 }
        );
      }
      const casesOnHand = Number(body.casesOnHand);
      if (!Number.isFinite(casesOnHand) || casesOnHand < 0) {
        return NextResponse.json({ success: false, error: 'Cases must be zero or greater.' }, { status: 400 });
      }
      const level = await setStockCases(productId, casesOnHand, body.staffId ?? 'staff-admin');
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
    const parCases = Number(body.parCases);
    if (!Number.isFinite(parCases)) {
      return NextResponse.json({ success: false, error: 'parCases must be a number.' }, { status: 400 });
    }
    const level = await setParCases(productId, parCases);
    return NextResponse.json({ success: true, level });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'The alert level could not be saved.',
      },
      { status: 500 }
    );
  }
}
