import { NextRequest, NextResponse } from 'next/server';
import { lookupOnHand } from '@/lib/stock';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const name = new URL(req.url).searchParams.get('name')?.trim() ?? '';
  if (!name) {
    return NextResponse.json({ success: false, error: 'name is required.' }, { status: 400 });
  }

  try {
    const stock = await lookupOnHand(name);
    return NextResponse.json({ success: true, ...stock });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Stock could not be read.',
      },
      { status: 500 }
    );
  }
}
