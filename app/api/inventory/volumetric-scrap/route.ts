import { NextRequest, NextResponse } from 'next/server';
import { calculateRealTimeWastePct } from '@/lib/domains/inventory/ledger';
import { logVolumetricScrapBuckets } from '@/lib/domains/inventory/stock';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireRoles } from '@/lib/auth/session';
import { SCRAP_LOG_ROLES } from '@/lib/auth/permissions';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { volumetricScrapBodySchema } from '@/lib/security/schemas/inventory';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const actor = await requireRoles(SCRAP_LOG_ROLES);
    const limited = assertMutationRateLimit(actor.id, 'volumetric-scrap', 40);
    if (limited) return limited;

    const body = await parseJsonBody(req, volumetricScrapBodySchema);
    const logged = await logVolumetricScrapBuckets(body.buckets, actor.id);
    const wasteKpi = await calculateRealTimeWastePct();
    return NextResponse.json({
      success: true,
      buckets: logged.buckets,
      referenceId: logged.referenceId,
      preview: logged.preview,
      wasteKpi,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Volumetric scrap could not be logged.');
  }
}
