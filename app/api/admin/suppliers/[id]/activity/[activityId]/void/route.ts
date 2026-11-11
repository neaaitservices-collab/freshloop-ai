import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireAdminStaff } from '@/lib/auth/guardRoute';
import { runSupplierActivity } from '@/lib/domains/suppliers/supplierActivity';
import { supplierActivityDb } from '@/lib/domains/suppliers/supplierActivityStore';
import { InvalidJsonBodyError } from '@/lib/security/parseJsonBody';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

async function readBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new InvalidJsonBodyError();
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; activityId: string }> }
) {
  try {
    const actor = await requireAdminStaff();
    const limited = assertMutationRateLimit(actor.id, 'supplier-activity-void', 30);
    if (limited) return limited;
    const { id, activityId } = await context.params;
    const result = await runSupplierActivity({
      actor,
      supplierId: id,
      activityId,
      action: 'void',
      body: await readBody(req),
      db: supplierActivityDb,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Activity could not be voided.');
  }
}
