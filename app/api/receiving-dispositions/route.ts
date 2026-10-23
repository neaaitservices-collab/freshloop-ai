import { NextRequest, NextResponse } from 'next/server';
import {
  createReceivingDisposition,
  listHiddenReceivingLogIds,
  listPendingVendorCredits,
  type ReceivingDispositionReason,
} from '@/lib/domains/receiving/receivingDisposition';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [pendingCredits, hiddenLogIds] = await Promise.all([
      listPendingVendorCredits(),
      listHiddenReceivingLogIds(),
    ]);
    return NextResponse.json({ success: true, pendingCredits, hiddenLogIds });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Could not load receiving dispositions.',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      externalLogId?: string;
      itemName?: string;
      casesReceived?: number;
      caseCost?: number;
      reason?: string;
      note?: string | null;
    };

    const externalLogId = body.externalLogId?.trim() ?? '';
    const itemName = body.itemName?.trim() ?? '';
    const casesReceived = Number(body.casesReceived);
    const caseCost = Number(body.caseCost);
    const reason = body.reason as ReceivingDispositionReason;

    if (!externalLogId || !itemName) {
      return NextResponse.json(
        { success: false, error: 'externalLogId and itemName are required.' },
        { status: 400 }
      );
    }
    if (reason !== 'NOT_RECEIVED' && reason !== 'REMOVED') {
      return NextResponse.json(
        { success: false, error: 'reason must be NOT_RECEIVED or REMOVED.' },
        { status: 400 }
      );
    }
    if (![casesReceived, caseCost].every(Number.isFinite)) {
      return NextResponse.json(
        { success: false, error: 'casesReceived and caseCost must be numbers.' },
        { status: 400 }
      );
    }

    const row = await createReceivingDisposition({
      externalLogId,
      itemName,
      casesReceived,
      caseCost,
      reason,
      note: body.note ?? null,
    });

    const [pendingCredits, hiddenLogIds] = await Promise.all([
      listPendingVendorCredits(),
      listHiddenReceivingLogIds(),
    ]);

    return NextResponse.json({
      success: true,
      disposition: row,
      pendingCredits,
      hiddenLogIds,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Could not save disposition.',
      },
      { status: 500 }
    );
  }
}
