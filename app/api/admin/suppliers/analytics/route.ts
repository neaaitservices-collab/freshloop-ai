import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { getVendorAnalyticsBundle } from '@/lib/domains/suppliers/vendorAnalytics';
import { supplierAnalyticsQuerySchema } from '@/lib/security/schemas/supplierAnalytics';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireManagerStaff();
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = supplierAnalyticsQuerySchema.parse(raw);
    const bundle = await getVendorAnalyticsBundle({
      lookbackDays: query.lookbackDays,
      supplierId: query.supplierId,
      priceAlertThresholdPct: query.priceAlertThresholdPct,
    });
    return NextResponse.json({ success: true, analytics: bundle });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Vendor analytics could not be loaded.');
  }
}
