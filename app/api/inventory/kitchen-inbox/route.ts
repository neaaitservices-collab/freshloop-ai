import { NextRequest, NextResponse } from 'next/server';
import { getKitchenInbox } from '@/lib/domains/inventory/kitchenInbox';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
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
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Kitchen inbox could not be loaded.',
      },
      { status: 500 }
    );
  }
}
