import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireReceivingStaff } from '@/lib/auth/guardRoute';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { reconcileSupplierInvoice } from '@/lib/domains/receiving/supplierInvoiceIdentity';

export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    action: z.enum([
      'link-date',
      'separate-document',
      'link-spelling',
      'separate-spelling',
      'add-lines',
      'map-line',
      'adopt-legacy',
    ]),
    supplierId: z.string().trim().min(1).max(128),
    invoiceNumber: z.string().trim().min(1).max(128),
    invoiceDate: z.string().trim().min(1).max(64),
    lines: z
      .array(z.object({ printedName: z.string().trim().min(1).max(256) }).strict())
      .max(80),
    confirmNewPrintedNames: z.array(z.string().trim().min(1).max(256)).max(80).optional(),
    legacyKey: z.string().trim().min(1).max(300).optional(),
    fromLineId: z.string().trim().min(1).max(64).optional(),
    mappedPrintedName: z.string().trim().min(1).max(256).optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  try {
    const actor = await requireReceivingStaff();
    const body = await parseJsonBody(req, bodySchema);
    const resolved = await reconcileSupplierInvoice({
      actorId: actor.id,
      action: body.action,
      supplierId: body.supplierId,
      invoiceNumber: body.invoiceNumber,
      invoiceDate: body.invoiceDate,
      lines: body.lines,
      confirmNewPrintedNames: body.confirmNewPrintedNames,
      legacyKey: body.legacyKey,
      fromLineId: body.fromLineId,
      mappedPrintedName: body.mappedPrintedName,
    });
    if (!resolved.ok) {
      return NextResponse.json(
        { success: false, error: resolved.error, code: resolved.code, ...(resolved.details ?? {}) },
        { status: 409 }
      );
    }
    return NextResponse.json({
      success: true,
      invoiceKey: resolved.invoiceKey,
      documentId: resolved.documentId,
      created: resolved.created,
      lines: resolved.lines,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'The invoice could not be reconciled.');
  }
}
