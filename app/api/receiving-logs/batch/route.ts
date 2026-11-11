import { NextRequest, NextResponse } from 'next/server';
import { InventoryLedgerError } from '@/lib/domains/inventory/ledger';
import { getSupplierNameById } from '@/lib/domains/suppliers/suppliers';
import {
  arrangeReceivingBatch,
  assertReceivingDepartmentsChosen,
  MAX_RECEIVING_BATCH_SIZE,
  postReceivingLogBatch,
  splitUnreadReceivingLines,
  receivingValidationHttpStatus,
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
    const { unread, rest } = splitUnreadReceivingLines(rawItems);
    const parsed: ReceivingLogPostInput[] = [];
    for (const row of rest) {
      const validated = validateReceivingLogPostInput({
        ...row,
        supplierId: row.supplierId ?? supplierId,
      });
      if (!validated.ok) {
        const status = receivingValidationHttpStatus(validated.error);
        return NextResponse.json(
          {
            success: false,
            error: `${row.itemName ?? 'Line'}: ${validated.error}`,
            ...(status === 409 ? { code: 'RETIRED_DELIVERY_ID' } : {}),
          },
          { status }
        );
      }
      parsed.push({
        ...validated.input,
        externalLogId: row.externalLogId,
        supplierId: validated.input.supplierId ?? supplierId,
      });
    }

    const arranged = arrangeReceivingBatch(parsed);
    const supplierName = supplierId ? await getSupplierNameById(supplierId) : null;
    await assertReceivingDepartmentsChosen(arranged.toPost, supplierName);
    const posted = parsed.length ? await postReceivingLogBatch(arranged.toPost, actor.id) : [];
    posted.forEach((row, index) => {
      const slot = arranged.postIndexes[index];
      if (slot === undefined) return;
      arranged.results[slot] = row;
    });
    const results = [...unread, ...arranged.results];
    const savedCount = results.filter((r) => r.stock.posted).length;
    const conflict = results.some((row) => row.stock.posted === false && row.stock.conflict === true);

    return NextResponse.json(
      {
        success: !conflict,
        savedCount,
        failedCount: results.length - savedCount,
        results,
        ...(conflict ? { error: 'A Delivery ID was reused with a different payload.', code: 'DELIVERY_CONFLICT' } : {}),
      },
      { status: conflict ? 409 : 200 }
    );
  } catch (error) {
    if (error instanceof InventoryLedgerError && error.code === 'DEPARTMENT_REQUIRED') {
      const body =
        error.details && typeof error.details === 'object'
          ? error.details
          : { success: false, error: error.message, field: 'department' };
      return NextResponse.json(body, { status: 400 });
    }
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return handleApiRouteError(
      'POST /api/receiving-logs/batch',
      error,
      'Failed to save invoice lines. Please try again.'
    );
  }
}
