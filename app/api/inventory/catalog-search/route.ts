import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/auth/http';
import { requireReceivingStaff } from '@/lib/auth/guardRoute';
import { searchActiveCatalog } from '@/lib/domains/catalog/productCatalog';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';

export const dynamic = 'force-dynamic';

/** Active catalog search for receiving staff. Manufactured items stay out. */
export async function GET(req: NextRequest) {
  try {
    await requireReceivingStaff();
    const q = req.nextUrl.searchParams.get('q') ?? '';
    const products = await searchActiveCatalog(q);
    return NextResponse.json({ success: true, products });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'The catalog could not be searched.');
  }
}
