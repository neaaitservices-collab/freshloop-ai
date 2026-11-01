import { NextRequest, NextResponse } from 'next/server';
import { recordProductSale } from '@/lib/domains/inventory/recordSale';
import { executeBundleSale } from '@/lib/domains/inventory/ledger';
import { prisma } from '@/lib/domains/inventory/ledger';

export const dynamic = 'force-dynamic';

type PosWebhookLine = {
  externalSku?: string;
  productId?: string;
  bundleSku?: string;
  quantity?: number;
  unitPrice?: number;
  location?: 'floor' | 'deli';
};

/**
 * Batch POS ingest — maps `POSMapping.externalSku` when `productId` is omitted.
 * Protect with `POS_WEBHOOK_SECRET` (Bearer token) in production.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.POS_WEBHOOK_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized POS webhook.' }, { status: 401 });
    }
  }

  try {
    const body = (await req.json()) as {
      externalRef?: string;
      staffId?: string;
      lines?: PosWebhookLine[];
    };

    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (lines.length === 0) {
      return NextResponse.json({ success: false, error: 'lines array is required.' }, { status: 400 });
    }

    const actorId = body.staffId?.trim() || 'pos-webhook';
    const results: unknown[] = [];

    for (const line of lines) {
      if (line.bundleSku) {
        results.push(
          await executeBundleSale(line.bundleSku, body.externalRef ?? `POS-${Date.now()}`, {
            staffId: actorId,
            quantitySold: line.quantity,
          })
        );
        continue;
      }

      let productId = line.productId?.trim() ?? '';
      if (!productId && line.externalSku) {
        const mapping = await prisma.pOSMapping.findFirst({
          where: { externalSku: line.externalSku, isActive: true },
          select: { productId: true },
        });
        productId = mapping?.productId ?? '';
      }

      if (!productId) {
        results.push({ skipped: true, reason: 'Unmapped SKU', line });
        continue;
      }

      results.push(
        await recordProductSale({
          productId,
          quantity: Number(line.quantity) || 1,
          staffId: actorId,
          location: line.location,
          unitPriceOverride: line.unitPrice,
          referenceId: body.externalRef,
        })
      );
    }

    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'POS webhook failed.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
