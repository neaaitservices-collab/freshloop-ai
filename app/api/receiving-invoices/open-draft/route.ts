import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireReceivingStaff } from '@/lib/auth/guardRoute';
import { discardOpenInvoiceScan, loadOpenInvoiceScan } from '@/lib/domains/receiving/openInvoiceScanStore';
import { parseJsonBody } from '@/lib/security/parseJsonBody';

export const dynamic = 'force-dynamic';

const discardSchema = z
  .object({
    draftId: z.string().trim().min(1).max(128),
  })
  .strict();

export async function GET() {
  try {
    const actor = await requireReceivingStaff();
    const draft = await loadOpenInvoiceScan(actor.id);
    return NextResponse.json({ success: true, draft });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'The open invoice scan could not be loaded.');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const actor = await requireReceivingStaff();
    const body = await parseJsonBody(req, discardSchema);
    const discarded = await discardOpenInvoiceScan(actor.id, body.draftId);
    if (!discarded.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            discarded.status === 409
              ? 'This scan was already received.'
              : 'That scan is not open.',
        },
        { status: discarded.status }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'The invoice scan could not be discarded.');
  }
}
