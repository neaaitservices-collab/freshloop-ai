import { NextRequest, NextResponse } from 'next/server';
import { getPlatformSettings, parsePlatformSettings, savePlatformSettings } from '@/lib/domains/stats/platformSettings';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await getPlatformSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Settings could not be loaded.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const parsed = parsePlatformSettings(await req.json());
    if ('error' in parsed) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const settings = await savePlatformSettings(parsed.settings);
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Settings could not be saved.' },
      { status: 500 }
    );
  }
}
