import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mergeCatalogProducts } from '@/lib/domains/inventory/catalogMerge';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireSessionUser } from '@/lib/auth/session';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { productIdSchema } from '@/lib/security/schemas/common';

const mergeBodySchema = z
  .object({
    primaryId: productIdSchema,
    mergeProductIds: z.array(productIdSchema).min(1).max(20),
  })
  .strict();

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const actor = await requireSessionUser();
    if (actor.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Only an admin can merge catalog SKUs.' },
        { status: 403 }
      );
    }
    const body = await parseJsonBody(req, mergeBodySchema);
    const result = await mergeCatalogProducts({
      primaryId: body.primaryId,
      mergeProductIds: body.mergeProductIds,
      staffId: actor.id,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    if (error instanceof Error) {
      const msg = error.message;
      if (
        msg.includes('Cannot merge') ||
        msg.includes('consolidat') ||
        msg.includes('Combine') ||
        msg.includes('not found') ||
        msg.includes('Manufactured') ||
        msg.includes('department') ||
        msg.includes('duplicate')
      ) {
        return NextResponse.json({ success: false, error: msg, message: msg }, { status: 400 });
      }
    }
    return apiErrorFromUnknown(error, 'Catalog SKUs could not be merged.');
  }
}
