import { NextRequest, NextResponse } from 'next/server';
import { logVolumetricScrapBuckets } from '@/lib/domains/inventory/stock';
import { apiError, apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireRoles } from '@/lib/auth/session';
import { MANAGER_ROLES } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const actor = await requireRoles(MANAGER_ROLES);
    const body = (await req.json()) as { buckets?: number; staffId?: string };
    const buckets = body.buckets;
    if (buckets === undefined || !Number.isFinite(buckets) || buckets <= 0) {
      return apiError('buckets must be a positive number.', 400);
    }
    const logged = await logVolumetricScrapBuckets(buckets, actor.id);
    return NextResponse.json({ success: true, ...logged });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Volumetric scrap could not be logged.');
  }
}
