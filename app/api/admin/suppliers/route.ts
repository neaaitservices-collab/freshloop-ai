import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff, requireOperationalStaff } from '@/lib/auth/guardRoute';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';
import { listSuppliers, upsertSupplierByName } from '@/lib/domains/suppliers/suppliers';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const supplierUpsertSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    contactName: z.string().trim().max(200).nullable().optional(),
    contactPhone: z.string().trim().max(64).nullable().optional(),
    contactEmail: z
      .union([z.string().trim().email().max(200), z.literal(''), z.null()])
      .optional(),
  })
  .strict();

export async function GET() {
  try {
    await requireOperationalStaff();
    const suppliers = await listSuppliers();
    return NextResponse.json({ success: true, suppliers });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Suppliers could not be loaded.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireManagerStaff();
    const limited = assertMutationRateLimit(actor.id, 'admin-suppliers-upsert', 60);
    if (limited) return limited;

    const body = await parseJsonBody(req, supplierUpsertSchema);
    const supplier = await upsertSupplierByName({
      name: body.name,
      contactName: body.contactName ?? null,
      contactPhone: body.contactPhone ?? null,
      contactEmail: body.contactEmail === '' ? null : (body.contactEmail ?? null),
    });
    return NextResponse.json({ success: true, supplier });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Supplier could not be saved.');
  }
}
