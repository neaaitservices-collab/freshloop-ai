import { NextResponse } from 'next/server';
import { getStoreStats } from '@/lib/domains/stats/storeStats';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff } from '@/lib/auth/guardRoute';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireManagerStaff();
    const stats = await getStoreStats();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Store statistics could not be read.',
      },
      { status: 500 }
    );
  }
}
