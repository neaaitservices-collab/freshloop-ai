import { NextRequest, NextResponse } from 'next/server';
import { listPendingVendorCredits, resolveVendorCredit } from '@/lib/domains/receiving/receivingDisposition';

export const dynamic = 'force-dynamic';

export async function PATCH(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const row = await resolveVendorCredit(id);
    if (!row) {
      return NextResponse.json({ success: false, error: 'Credit line not found.' }, { status: 404 });
    }
    const pendingCredits = await listPendingVendorCredits();
    return NextResponse.json({ success: true, disposition: row, pendingCredits });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Could not update credit line.',
      },
      { status: 500 }
    );
  }
}
