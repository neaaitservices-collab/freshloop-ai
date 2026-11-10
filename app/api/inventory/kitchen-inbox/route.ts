import { NextRequest, NextResponse } from 'next/server';
import { getKitchenInbox } from '@/lib/domains/inventory/kitchenInbox';
import { authErrorResponse } from '@/lib/auth/http';
import { requireKitchenStaff } from '@/lib/auth/guardRoute';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { statsRangeQuerySchema } from '@/lib/security/schemas/statsRange';
import { presetRange, torontoRange } from '@/lib/domains/stats/storeTime';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireKitchenStaff();
    const hoursRaw = req.nextUrl.searchParams.get('hours');
    const hours = hoursRaw ? Number(hoursRaw) : 24;
    const sinceHours = Number.isFinite(hours) && hours > 0 && hours <= 168 ? hours : 24;
    const parsed = statsRangeQuerySchema.safeParse({
      preset: req.nextUrl.searchParams.get('preset') ?? undefined,
      from: req.nextUrl.searchParams.get('from') ?? undefined,
      to: req.nextUrl.searchParams.get('to') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? 'Invalid date range.' },
        { status: 400 }
      );
    }
    const bounds = parsed.data.preset
      ? presetRange(parsed.data.preset)
      : parsed.data.from && parsed.data.to
        ? { from: parsed.data.from, to: parsed.data.to }
        : null;
    const range = bounds ? torontoRange(bounds.from, bounds.to) : null;
    const items = await getKitchenInbox(sinceHours, range);
    return NextResponse.json({
      success: true,
      sinceHours,
      range: range ? { from: range.from, to: range.to } : null,
      count: items.length,
      items,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Production inbox could not be loaded.');
  }
}
