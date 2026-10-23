import { NextRequest, NextResponse } from 'next/server';
import { logVolumetricScrapBuckets } from '@/lib/stock';
import { apiError, apiErrorFromUnknown } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { buckets?: number; staffId?: string };
    const buckets = body.buckets;
    if (buckets === undefined || !Number.isFinite(buckets) || buckets <= 0) {
      return apiError('buckets must be a positive number.', 400);
    }
    const logged = await logVolumetricScrapBuckets(buckets, body.staffId ?? '');
    return NextResponse.json({ success: true, ...logged });
  } catch (error) {
    return apiErrorFromUnknown(error, 'Volumetric scrap could not be logged.');
  }
}
