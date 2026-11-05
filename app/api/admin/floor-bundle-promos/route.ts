import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import {
  requireAuthenticatedStaff,
  requireOwnerOrStoreManagerForBundles,
} from '@/lib/auth/guardRoute';
import {
  deactivateFloorBundlePromo,
  getFloorBundlePromoForProduct,
  listFloorBundlePromos,
  upsertFloorBundlePromo,
} from '@/lib/domains/pricing/floorBundlePromo';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import {
  floorBundlePromoBodySchema,
  floorBundlePromoQuerySchema,
} from '@/lib/security/schemas/floorBundlePromo';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAuthenticatedStaff();
    const productId = req.nextUrl.searchParams.get('productId') ?? undefined;

    if (productId) {
      await requireOwnerOrStoreManagerForBundles();
    }
    const query = floorBundlePromoQuerySchema.parse({ productId });

    if (query.productId) {
      const promo = await getFloorBundlePromoForProduct(query.productId);
      return NextResponse.json({ success: true, promo });
    }

    const promos = await listFloorBundlePromos(true);
    return NextResponse.json({ success: true, promos });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return apiErrorFromUnknown(error, 'Could not load bundle promos.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireOwnerOrStoreManagerForBundles();
    const limited = assertMutationRateLimit(actor.id, 'floor-bundle-promo', 60);
    if (limited) return limited;

    const body = await parseJsonBody(req, floorBundlePromoBodySchema);
    const promo = await upsertFloorBundlePromo({
      productId: body.productId,
      minUnits: body.minUnits,
      bundlePrice: body.bundlePrice,
      label: body.label,
      createdById: actor.id,
    });
    return NextResponse.json({ success: true, promo });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return apiErrorFromUnknown(error, 'Could not save bundle promo. If this is a new install, run npx prisma migrate deploy.');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireOwnerOrStoreManagerForBundles();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return apiError('id query parameter is required.', 400);
    }
    await deactivateFloorBundlePromo(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return apiErrorFromUnknown(error, 'Could not remove bundle promo.');
  }
}
