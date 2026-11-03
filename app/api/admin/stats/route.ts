import { NextResponse } from 'next/server';
import { getAdminStoreStatsBundle } from '@/lib/domains/stats/storeStats';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff } from '@/lib/auth/guardRoute';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireManagerStaff();
    const { stats, wasteKpi } = await getAdminStoreStatsBundle();
    return NextResponse.json({ success: true, stats, wasteKpi });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Store statistics could not be read.');
  }
}
