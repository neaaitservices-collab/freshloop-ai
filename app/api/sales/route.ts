import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireOperationalStaff } from '@/lib/auth/guardRoute';
import { recordProductSale } from '@/lib/domains/inventory/recordSale';
import { executeBundleSale } from '@/lib/domains/inventory/ledger';
import { staffSaleIdempotencyKey } from '@/lib/domains/inventory/saleIdempotency';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { salesPostBodySchema } from '@/lib/security/schemas/sales';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const actor = await requireOperationalStaff();
    const limited = assertMutationRateLimit(actor.id, 'sales-record', 120);
    if (limited) return limited;

    const body = await parseJsonBody(req, salesPostBodySchema);
    const idempotencyKey = staffSaleIdempotencyKey(body.clientMutationId);

    if (body.bundleId || body.bundleSku) {
      const bundleId = body.bundleId ?? body.bundleSku ?? '';
      const result = await executeBundleSale(bundleId, body.externalRef, {
        staffId: actor.id,
        idempotencyKey,
      });
      return NextResponse.json({
        success: true,
        type: 'bundle',
        idempotent: result.idempotent === true,
        result,
      });
    }

    const productId = body.productId!;
    const quantity = body.quantity!;
    const sale = await recordProductSale({
      productId,
      quantity,
      staffId: actor.id,
      location: body.location,
      unitPriceOverride: body.unitPrice,
      idempotencyKey,
    });

    return NextResponse.json({
      success: true,
      type: 'product',
      idempotent: sale.idempotent === true,
      sale,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Sale could not be recorded.');
  }
}
