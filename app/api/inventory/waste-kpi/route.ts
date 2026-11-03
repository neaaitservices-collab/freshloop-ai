import { NextResponse } from 'next/server';
import { calculateRealTimeWastePct } from '@/lib/domains/inventory/ledger';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireRoles } from '@/lib/auth/session';
import { SCRAP_LOG_ROLES } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/** Waste semáforo payload for production floor (not manager-only `/api/admin/stats`). */
export async function GET() {
  try {
    await requireRoles(SCRAP_LOG_ROLES);
    const wasteKpi = await calculateRealTimeWastePct();
    return NextResponse.json({ success: true, wasteKpi });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Waste KPI could not be loaded.');
  }
}
