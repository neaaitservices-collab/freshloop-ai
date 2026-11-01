import { NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { listMarkdownSuggestions } from '@/lib/domains/pricing/markdownSuggestion';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireManagerStaff();
    const suggestions = await listMarkdownSuggestions();
    return NextResponse.json({ success: true, suggestions });
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : 'Could not load markdown suggestions.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
