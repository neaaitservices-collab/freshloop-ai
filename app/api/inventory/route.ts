import { NextRequest, NextResponse } from 'next/server';
import { getInventoryItems, updateInventoryItem } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'ALL';
    const pullDays = searchParams.get('pullDays');

    const items = await getInventoryItems({
      status,
      pullThresholdDays: pullDays ? parseInt(pullDays, 10) : undefined
    });

    return NextResponse.json({
      success: true,
      count: items.length,
      items
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, updates } = body;

    if (!id || !updates) {
      return NextResponse.json({ error: 'Missing id or updates parameter' }, { status: 400 });
    }

    const updated = await updateInventoryItem(id, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, item: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
