import { NextRequest, NextResponse } from 'next/server';
import { RECEIVING_SHEET_NAME } from '@/lib/domains/receiving/receivingSheet';
import {
  MAX_RECEIVING_BATCH_SIZE,
  postReceivingLogBatch,
  validateReceivingLogPostInput,
  type ReceivingLogPostInput,
} from '@/lib/domains/receiving/receivingLogPost';
import { handleApiRouteError } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireReceivingStaff } from '@/lib/auth/guardRoute';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const actor = await requireReceivingStaff();
    const body = (await req.json()) as {
      supplierId?: string;
      items?: Array<Partial<ReceivingLogPostInput> & { externalLogId?: string }>;
    };

    const rawItems = body.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json({ success: false, error: 'items array is required.' }, { status: 400 });
    }
    if (rawItems.length > MAX_RECEIVING_BATCH_SIZE) {
      return NextResponse.json(
        { success: false, error: `Batch limit is ${MAX_RECEIVING_BATCH_SIZE} lines.` },
        { status: 400 }
      );
    }

    const supplierId = body.supplierId?.trim();
    const parsed: ReceivingLogPostInput[] = [];
    for (const row of rawItems) {
      const validated = validateReceivingLogPostInput({
        ...row,
        supplierId: row.supplierId ?? supplierId,
      });
      if (!validated.ok) {
        return NextResponse.json(
          { success: false, error: `${row.itemName ?? 'Line'}: ${validated.error}` },
          { status: 400 }
        );
      }
      parsed.push({
        ...validated.input,
        externalLogId: row.externalLogId,
        supplierId: validated.input.supplierId ?? supplierId,
      });
    }

    const results = await postReceivingLogBatch(parsed, actor.id);
    const savedCount = results.filter((r) => r.stock.posted).length;

    return NextResponse.json({
      success: true,
      sheetName: RECEIVING_SHEET_NAME,
      savedCount,
      failedCount: results.length - savedCount,
      results,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return handleApiRouteError(
      'POST /api/receiving-logs/batch',
      error,
      'Failed to save invoice lines. Please try again.'
    );
  }
}
