import { NextRequest, NextResponse } from 'next/server';
import { lookupOnHand } from '@/lib/domains/inventory/stock';
import { authErrorResponse } from '@/lib/auth/http';
import { requireOperationalStaff } from '@/lib/auth/guardRoute';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const name = new URL(req.url).searchParams.get('name')?.trim() ?? '';
  if (!name) {
    return NextResponse.json({ success: false, error: 'name is required.' }, { status: 400 });
  }

  try {
    await requireOperationalStaff();
    const stock = await lookupOnHand(name);
    return NextResponse.json({ success: true, ...stock });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Stock could not be read.');
  }
}
