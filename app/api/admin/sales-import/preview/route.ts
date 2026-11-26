import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { callerStoreId, assertRequestedStore } from '@/lib/domains/inventory/saleStoreScope';
import { prisma } from '@/lib/domains/inventory/ledger';
import { previewCsvSales } from '@/lib/domains/inventory/csvSalesImport';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { CSV_SALES_MAX_BYTES, csvSalesImportBodySchema } from '@/lib/security/schemas/csvSalesImport';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const actor = await requireManagerStaff();
    const limited = assertMutationRateLimit(actor.id, 'sales-import', 20);
    if (limited) return limited;
    const declared = Number(req.headers.get('content-length') ?? '0');
    if (declared > CSV_SALES_MAX_BYTES + 64_000) {
      return NextResponse.json({ success: false, error: 'That CSV is too large. The limit is 1 MB.' }, { status: 413 });
    }
    const body = await parseJsonBody(req, csvSalesImportBodySchema);
    const storeId = await callerStoreId(prisma);
    assertRequestedStore(storeId, body.storeId);
    const preview = await previewCsvSales({
      csv: body.csv,
      mapping: body.mapping,
      storeId,
    });
    return NextResponse.json({ success: true, preview });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'The CSV could not be previewed.');
  }
}
