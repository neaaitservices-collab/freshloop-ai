import { NextResponse } from 'next/server';
import { listDuplicateCatalogGroups } from '@/lib/domains/inventory/catalogMerge';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireSessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const actor = await requireSessionUser();
    if (actor.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Only an admin can review duplicate catalog SKUs.' },
        { status: 403 }
      );
    }
    const groups = await listDuplicateCatalogGroups();
    return NextResponse.json({ success: true, groups, count: groups.length });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Duplicate catalog groups could not be loaded.');
  }
}
