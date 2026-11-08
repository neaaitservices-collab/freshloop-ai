import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireReceivingStaff } from '@/lib/auth/guardRoute';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import {
  INVOICE_NUMBER_REUSE_POLICY,
  resolveSupplierInvoice,
} from '@/lib/domains/receiving/supplierInvoiceIdentity';

export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    supplierId: z.string().trim().min(1).max(128),
    invoiceNumber: z.string().trim().min(1).max(128),
    invoiceDate: z.string().trim().max(64).optional(),
    lines: z
      .array(
        z
          .object({
            printedName: z.string().trim().min(1).max(256),
          })
          .strict()
      )
      .min(1)
      .max(80),
  })
  .strict();

export async function POST(req: NextRequest) {
  try {
    await requireReceivingStaff();
    const body = await parseJsonBody(req, bodySchema);
    const resolved = await resolveSupplierInvoice({
      supplierId: body.supplierId,
      invoiceNumber: body.invoiceNumber,
      invoiceDate: body.invoiceDate,
      lines: body.lines,
    });
    if (!resolved.ok) {
      return NextResponse.json(
        { success: false, error: resolved.error, code: resolved.code },
        { status: 409 }
      );
    }
    return NextResponse.json({
      success: true,
      invoiceKey: resolved.invoiceKey,
      created: resolved.created,
      policy: INVOICE_NUMBER_REUSE_POLICY,
      lines: resolved.lines,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'The invoice could not be identified.');
  }
}
