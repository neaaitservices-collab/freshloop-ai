import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireOperationalStaff } from '@/lib/auth/guardRoute';
import { recordProductSale } from '@/lib/domains/inventory/recordSale';
import { executeBundleSale, InventoryLedgerError, prisma } from '@/lib/domains/inventory/ledger';
import { staffSaleIdempotencyKey } from '@/lib/domains/inventory/saleIdempotency';
import { assertRequestedStore, callerStoreId } from '@/lib/domains/inventory/saleStoreScope';
import { getStockLevel } from '@/lib/domains/inventory/stock';
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
    assertRequestedStore(await callerStoreId(prisma), body.storeId);
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
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, catalogActive: true },
    });
    if (!product || !product.catalogActive) {
      throw new InventoryLedgerError(
        'Product was not found in this store.',
        'PRODUCT_NOT_IN_STORE',
        404
      );
    }
    const sale = await recordProductSale({
      productId,
      quantity,
      staffId: actor.id,
      location: body.location ?? 'floor',
      unitPriceOverride: body.unitPrice,
      idempotencyKey,
    });
    const level = await getStockLevel(productId);

    return NextResponse.json({
      success: true,
      type: 'product',
      idempotent: sale.idempotent === true,
      sale,
      level,
      units: sale.quantitySold,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Sale could not be recorded.');
  }
}
