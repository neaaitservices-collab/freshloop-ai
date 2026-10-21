import { NextResponse } from 'next/server';
import { getStoreStats } from '@/lib/storeStats';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stats = await getStoreStats();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Store statistics could not be read.',
      },
      { status: 500 }
    );
  }
}
