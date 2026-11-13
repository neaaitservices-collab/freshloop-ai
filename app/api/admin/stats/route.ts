import { NextRequest, NextResponse } from 'next/server';
import { getAdminPeriodFigures, getAdminStoreStatsBundle } from '@/lib/domains/stats/storeStats';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { statsRangeQuerySchema } from '@/lib/security/schemas/statsRange';
import { presetRange, torontoRange } from '@/lib/domains/stats/storeTime';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireManagerStaff();
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
    const scope = req.nextUrl.searchParams.get('scope');
    if (scope && scope !== 'period') {
      return NextResponse.json(
        { success: false, error: 'Unknown stats scope.' },
        { status: 400 }
      );
    }
    if (scope === 'period') {
      if (!range) {
        return NextResponse.json(
          { success: false, error: 'Choose a date range.' },
          { status: 400 }
        );
      }
      const period = await getAdminPeriodFigures(range);
      return NextResponse.json(
        { success: true, period },
        {
          headers: {
            'Cache-Control': 'private, max-age=10, stale-while-revalidate=20',
          },
        }
      );
    }
    const { stats, wasteKpi } = await getAdminStoreStatsBundle(range);
    return NextResponse.json(
      { success: true, stats, wasteKpi },
      {
        headers: {
          'Cache-Control': 'private, max-age=10, stale-while-revalidate=20',
        },
      }
    );
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Store statistics could not be read.');
  }
}
