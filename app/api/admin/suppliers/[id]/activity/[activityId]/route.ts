import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { runSupplierActivity } from '@/lib/domains/suppliers/supplierActivity';
import { supplierActivityDb } from '@/lib/domains/suppliers/supplierActivityStore';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { receiveCreditSchema } from '@/lib/security/schemas/supplierActivity';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; activityId: string }> }
) {
  try {
    const actor = await requireManagerStaff();
    const limited = assertMutationRateLimit(actor.id, 'supplier-activity-receive', 60);
    if (limited) return limited;
    const { id, activityId } = await context.params;
    const result = await runSupplierActivity({
      actor,
      supplierId: id,
      activityId,
      action: 'receive',
      body: await parseJsonBody(req, receiveCreditSchema),
      db: supplierActivityDb,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Credit could not be marked received.');
  }
}
