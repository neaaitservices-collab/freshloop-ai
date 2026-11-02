import { NextRequest, NextResponse } from 'next/server';
import { listPendingVendorCredits, resolveVendorCredit } from '@/lib/domains/receiving/receivingDisposition';
import { authErrorResponse } from '@/lib/auth/http';
import { requireReceivingStaff } from '@/lib/auth/guardRoute';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';

export const dynamic = 'force-dynamic';

export async function PATCH(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireReceivingStaff();
    const { id } = await context.params;
    const row = await resolveVendorCredit(id);
    if (!row) {
      return NextResponse.json({ success: false, error: 'Credit line not found.' }, { status: 404 });
    }
    const pendingCredits = await listPendingVendorCredits();
    return NextResponse.json({ success: true, disposition: row, pendingCredits });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Could not update credit line.');
  }
}
