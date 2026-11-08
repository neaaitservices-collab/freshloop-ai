import { NextRequest, NextResponse } from 'next/server';
import { getPlatformSettings, parsePlatformSettings, savePlatformSettings } from '@/lib/domains/stats/platformSettings';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff, requireOperationalStaff } from '@/lib/auth/guardRoute';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireOperationalStaff();
    const settings = await getPlatformSettings();
    return NextResponse.json(
      { success: true, settings },
      {
        headers: {
          'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
        },
      }
    );
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Settings could not be loaded.');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireManagerStaff();
    const limited = assertMutationRateLimit(actor.id, 'admin-settings', 20);
    if (limited) return limited;

    const parsed = parsePlatformSettings(await req.json());
    if ('error' in parsed) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const settings = await savePlatformSettings(parsed.settings);
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Settings could not be saved.');
  }
}
