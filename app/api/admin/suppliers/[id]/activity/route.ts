import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireReceivingStaff } from '@/lib/auth/guardRoute';
import { runSupplierActivity } from '@/lib/domains/suppliers/supplierActivity';
import { supplierActivityDb } from '@/lib/domains/suppliers/supplierActivityStore';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { manualActivityBodySchema } from '@/lib/security/schemas/supplierActivity';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

function jsonResult(result: { status: number; body: unknown }) {
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireReceivingStaff();
    const { id } = await context.params;
    const result = await runSupplierActivity({
      actor,
      supplierId: id,
      action: 'list',
      filter: req.nextUrl.searchParams.get('filter'),
      cursor: req.nextUrl.searchParams.get('cursor'),
      db: supplierActivityDb,
    });
    return jsonResult(result);
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Supplier activity could not be loaded.');
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireReceivingStaff();
    const limited = assertMutationRateLimit(actor.id, 'supplier-activity-add', 60);
    if (limited) return limited;
    const { id } = await context.params;
    const result = await runSupplierActivity({
      actor,
      supplierId: id,
      action: 'add',
      body: await parseJsonBody(req, manualActivityBodySchema),
      db: supplierActivityDb,
    });
    return jsonResult(result);
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Supplier activity could not be saved.');
  }
}
