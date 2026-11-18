import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPlatformSettings, parsePlatformSettings, savePlatformSettings } from '@/lib/domains/stats/platformSettings';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff, requireOperationalStaff } from '@/lib/auth/guardRoute';
import { numericInput } from '@/lib/security/numericInput';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';

const settingsNumber = numericInput(z.number().finite());

const SETTINGS_NUMBER_FIELDS = [
  ['targetWastePct', 'Waste target'],
  ['scrapBucketVolumeL', 'Scrap bucket size'],
  ['estimatedWeightPerLiterKg', 'Trim density'],
  ['defaultScrapCostPerKg', 'Scrap cost'],
  ['defaultLaborRatePerHour', 'Labor rate'],
  ['pullSensitivityDays', 'Pull window'],
  ['costGuardrailVariancePct', 'Invoice alert'],
  ['priceChangeThresholdPct', 'Price change alert'],
  ['defaultParCases', 'Minimum stock'],
] as const;

/** Reject blank numeric strings before parsePlatformSettings can turn them into 0. */
function blankSettingsNumberMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const source = body as Record<string, unknown>;
  for (const [key, label] of SETTINGS_NUMBER_FIELDS) {
    const value = source[key];
    if (typeof value !== 'string') continue;
    if (!settingsNumber.safeParse(value).success) {
      return `${label} must be a number.`;
    }
  }
  return null;
}

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

    const body = await req.json();
    const blankNumber = blankSettingsNumberMessage(body);
    if (blankNumber) {
      return NextResponse.json({ success: false, error: blankNumber }, { status: 400 });
    }
    const parsed = parsePlatformSettings(body);
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
