import { NextRequest, NextResponse } from 'next/server';
import { loadReceivingLogs, RECEIVING_SHEET_NAME } from '@/lib/domains/receiving/receivingSheet';
import {
  buildSavedPackRecord,
  postReceivingLogToInventory,
  validateReceivingLogPostInput,
} from '@/lib/domains/receiving/receivingLogPost';
import { getSupplierNameById } from '@/lib/domains/suppliers/suppliers';
import { handleApiRouteError } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireReceivingStaff } from '@/lib/auth/guardRoute';

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
    const result = await loadReceivingLogs();
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
      return NextResponse.json({ success: false, error: validated.error }, { status: 400 });
    }
    const input = validated.input;

    const record = buildSavedPackRecord(input);
    savedPacks.unshift(record);
    if (savedPacks.length > 50) savedPacks.pop();

    const supplierName = input.supplierId ? await getSupplierNameById(input.supplierId) : null;
    const posted = await postReceivingLogToInventory(input, actor.id, supplierName);
    const stock = posted.stock;

    return NextResponse.json({
      success: true,
      destination: stock.posted ? 'ledger' : 'session',
      sheetName: RECEIVING_SHEET_NAME,
      record,
      stock,
      savedCount: savedPacks.length,
    });
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
