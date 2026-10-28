import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/auth/http';
import { requireSessionUser } from '@/lib/auth/session';
import { recordProductSale } from '@/lib/domains/inventory/recordSale';
import { executeBundleSale } from '@/lib/domains/inventory/ledger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const actor = await requireSessionUser();
    const body = (await req.json()) as {
      productId?: string;
      quantity?: number;
      location?: 'floor' | 'deli';
      unitPrice?: number;
      bundleId?: string;
      bundleSku?: string;
      externalRef?: string;
    };

    if (body.bundleId || body.bundleSku) {
      const bundleId = body.bundleId ?? body.bundleSku ?? '';
      const result = await executeBundleSale(bundleId, body.externalRef ?? `POS-${Date.now()}`, {
        staffId: actor.id,
      });
      return NextResponse.json({ success: true, type: 'bundle', result });
    }

    const productId = body.productId?.trim() ?? '';
    const quantity = Number(body.quantity);
    if (!productId) {
      return NextResponse.json({ success: false, error: 'productId is required.' }, { status: 400 });
    }

    const sale = await recordProductSale({
      productId,
      quantity,
      staffId: actor.id,
      location: body.location,
      unitPriceOverride: Number.isFinite(Number(body.unitPrice)) ? Number(body.unitPrice) : undefined,
    });

    return NextResponse.json({ success: true, type: 'product', sale });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : 'Sale could not be recorded.';
    const status = message.includes('Insufficient') || message.includes('not found') ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
