import { NextRequest, NextResponse } from 'next/server';
import { listReceivingDeliveryLogs } from '@/lib/domains/receiving/receivingDeliveries';
import { RECEIVING_SHEET_NAME } from '@/lib/domains/receiving/receivingSheet';
import {
  buildSavedPackRecord,
  postReceivingLogToInventory,
  receivingLineHttpStatus,
  receivingValidationHttpStatus,
  validateReceivingLogPostInput,
} from '@/lib/domains/receiving/receivingLogPost';
import { getSupplierNameById } from '@/lib/domains/suppliers/suppliers';
import { handleApiRouteError } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireReceivingStaff } from '@/lib/auth/guardRoute';
import { sampleReceivingRejection } from '@/lib/domains/receiving/sampleReceivingGuard';

export const dynamic = 'force-dynamic';

interface SavedPack {
  id: string;
  itemName: string;
  casesReceived: number;
  caseCost: number;
  packSize: number;
  splitFactor: number;
  retailUnit: string;
  targetMargin: number;
  totalRetailUnits: number | null;
  unitCost: number | null;
  targetSrp: number | null;
  currentRetailPrice: number;
  currentMarginPct: number | null;
  savedAt: string;
}

const savedPacks: SavedPack[] = [];

export async function GET() {
  try {
    await requireReceivingStaff();
    const result = await listReceivingDeliveryLogs();
    return NextResponse.json(result);
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return handleApiRouteError('GET /api/receiving-logs', error, 'Receiving logs could not be loaded.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireReceivingStaff();
    const body = (await req.json()) as Record<string, unknown>;

    const validated = validateReceivingLogPostInput(body as Parameters<typeof validateReceivingLogPostInput>[0]);
    if (!validated.ok) {
      const status = receivingValidationHttpStatus(validated.error);
      return NextResponse.json(
        {
          success: false,
          error: validated.error,
          ...(status === 409 ? { code: 'RETIRED_DELIVERY_ID' } : {}),
        },
        { status }
      );
    }
    const input = validated.input;
    const sampleReason = sampleReceivingRejection(input);
    if (sampleReason) {
      return NextResponse.json({ success: false, error: sampleReason }, { status: 409 });
    }

    const record = buildSavedPackRecord(input);
    savedPacks.unshift(record);
    if (savedPacks.length > 50) savedPacks.pop();

    const supplierName = input.supplierId ? await getSupplierNameById(input.supplierId) : null;
    const posted = await postReceivingLogToInventory(input, actor.id, supplierName);
    const stock = posted.stock;

    const status = receivingLineHttpStatus(stock);
    return NextResponse.json(
      {
        success: status === 200,
        destination: stock.posted ? 'ledger' : 'session',
        sheetName: RECEIVING_SHEET_NAME,
        record,
        stock,
        savedCount: savedPacks.length,
        ...(status === 409 ? { error: stock.posted ? undefined : stock.reason, code: 'DELIVERY_CONFLICT' } : {}),
      },
      { status }
    );
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return handleApiRouteError(
      'POST /api/receiving-logs',
      error,
      'Failed to save the configured pack. Please try again.'
    );
  }
}
