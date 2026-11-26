import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { callerStoreId, assertRequestedStore } from '@/lib/domains/inventory/saleStoreScope';
import { prisma } from '@/lib/domains/inventory/ledger';
import {
  loadCsvColumnMapping,
  saveCsvColumnMapping,
} from '@/lib/domains/inventory/csvSalesImport';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { csvSalesMappingBodySchema } from '@/lib/security/schemas/csvSalesImport';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireManagerStaff();
    const storeId = await callerStoreId(prisma);
    const mapping = await loadCsvColumnMapping(storeId);
    return NextResponse.json({ success: true, storeId, mapping });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'The column mapping could not be loaded.');
  }
}

export async function PUT(req: NextRequest) {
  try {
    const actor = await requireManagerStaff();
    const limited = assertMutationRateLimit(actor.id, 'sales-import', 20);
    if (limited) return limited;
    const body = await parseJsonBody(req, csvSalesMappingBodySchema);
    const storeId = await callerStoreId(prisma);
    assertRequestedStore(storeId, body.storeId);
    const mapping = await saveCsvColumnMapping(storeId, body.mapping);
    return NextResponse.json({ success: true, storeId, mapping });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'The column mapping could not be saved.');
  }
}
