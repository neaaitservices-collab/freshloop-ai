import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireReceivingStaff } from '@/lib/auth/guardRoute';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';
import { upsertSupplierByName } from '@/lib/domains/suppliers/suppliers';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createSupplierSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict();

/**
 * Explicit "add this printed name" from invoice review.
 * Matching does not call this. A clerk has to choose the option and save.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireReceivingStaff();
    const limited = assertMutationRateLimit(actor.id, 'receiving-suppliers-create', 30);
    if (limited) return limited;

    const body = await parseJsonBody(req, createSupplierSchema);
    const supplier = await upsertSupplierByName({ name: body.name });
    return NextResponse.json({ success: true, supplier });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Supplier could not be saved.');
  }
}
