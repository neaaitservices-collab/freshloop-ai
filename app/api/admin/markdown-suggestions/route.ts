import { NextResponse } from 'next/server';
import { handleApiRouteError } from '@/lib/domains/ai/apiError';
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
    return handleApiRouteError(
      'GET /api/admin/markdown-suggestions',
      error,
      'Could not load markdown suggestions.'
    );
  }
}
