import { NextRequest, NextResponse } from 'next/server';
import { getKitchenInbox } from '@/lib/domains/inventory/kitchenInbox';
import { authErrorResponse } from '@/lib/auth/http';
import { requireKitchenStaff } from '@/lib/auth/guardRoute';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireKitchenStaff();
    const hoursRaw = req.nextUrl.searchParams.get('hours');
    const hours = hoursRaw ? Number(hoursRaw) : 24;
    const sinceHours = Number.isFinite(hours) && hours > 0 && hours <= 168 ? hours : 24;
    const items = await getKitchenInbox(sinceHours);
    return NextResponse.json({
      success: true,
      sinceHours,
      count: items.length,
      items,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Kitchen inbox could not be loaded.');
  }
}
