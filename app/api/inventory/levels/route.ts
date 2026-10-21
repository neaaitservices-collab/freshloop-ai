import { NextRequest, NextResponse } from 'next/server';
import { getStockLevels, PAR_CASES, setParCases } from '@/lib/stock';

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
    const body = (await req.json()) as { productId?: string; parCases?: number };
    const productId = body.productId?.trim() ?? '';
    const parCases = Number(body.parCases);
    if (!productId) {
      return NextResponse.json({ success: false, error: 'productId is required.' }, { status: 400 });
    }
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
