import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { callerStoreId, assertRequestedStore } from '@/lib/domains/inventory/saleStoreScope';
import { prisma } from '@/lib/domains/inventory/ledger';
import { confirmCsvSales } from '@/lib/domains/inventory/csvSalesImport';
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
    const result = await confirmCsvSales({
      csv: body.csv,
      mapping: body.mapping,
      storeId,
      staffId: actor.id,
    });
    return NextResponse.json({
      success: true,
      posted: result.posted,
      alreadyPosted: result.alreadyPosted,
      failed: result.failed,
      dateRange: result.preview.dateRange,
      days: result.preview.days,
      matched: result.preview.matched.length,
      unknown: result.preview.unknown.length,
      bad: result.preview.bad.length,
      duplicate: result.preview.duplicate.length,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'The CSV could not be posted.');
  }
}
