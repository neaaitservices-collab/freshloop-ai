import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { executeBundleSale, prisma } from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { recordProductSale } from '@/lib/domains/inventory/recordSale';
import { handleApiRouteError } from '@/lib/domains/ai/apiError';
import { assertHotPathRateLimit, clientIpKey } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

const POS_WEBHOOK_ACTOR = 'pos-webhook';

type PosWebhookLine = {
  externalSku?: string;
  productId?: string;
  bundleSku?: string;
  quantity?: number;
  unitPrice?: number;
  location?: 'floor' | 'deli';
};

function webhookAuthorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? '');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * Batch POS ingest — maps `POSMapping.externalSku` when `productId` is omitted.
 * Middleware does not require a session. `POS_WEBHOOK_SECRET` is required.
 * `externalRef` identifies the batch so a retry does not post twice.
 * Staff is always `pos-webhook` — the JSON body cannot set `staffId`.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.POS_WEBHOOK_SECRET?.trim();
  if (!secret || !webhookAuthorized(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ success: false, error: 'Unauthorized POS webhook.' }, { status: 401 });
  }

  const limited = assertHotPathRateLimit(clientIpKey(req), 'posWebhook');
  if (limited) return limited;

  try {
    const body = (await req.json()) as {
      externalRef?: string;
      lines?: PosWebhookLine[];
    };

    const externalRef = body.externalRef?.trim() ?? '';
    if (!externalRef) {
      return NextResponse.json({ success: false, error: 'externalRef is required.' }, { status: 400 });
    }

    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (lines.length === 0) {
      return NextResponse.json({ success: false, error: 'lines array is required.' }, { status: 400 });
    }

    const outcome = await prisma.$transaction(
      async (db) => {
        await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${externalRef}))`;
        const existing = await db.inventoryTransaction.findFirst({
          where: { referenceId: externalRef },
          select: { id: true },
        });
        if (existing) {
          return { idempotent: true as const, results: [] as unknown[] };
        }

        const results: unknown[] = [];
        for (const line of lines) {
          if (line.bundleSku) {
            results.push(
              await executeBundleSale(line.bundleSku, externalRef, {
                staffId: POS_WEBHOOK_ACTOR,
                quantitySold: line.quantity,
                db,
              })
            );
            continue;
          }

          let productId = line.productId?.trim() ?? '';
          if (!productId && line.externalSku) {
            const mapping = await db.pOSMapping.findFirst({
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
              staffId: POS_WEBHOOK_ACTOR,
              location: line.location,
              unitPriceOverride: line.unitPrice,
              referenceId: externalRef,
              db,
            })
          );
        }

        return { idempotent: false as const, results };
      },
      { timeout: 20_000 }
    );

    if (!outcome.idempotent) invalidateInventoryCaches();

    return NextResponse.json({
      success: true,
      idempotent: outcome.idempotent,
      processed: outcome.results.length,
      results: outcome.results,
    });
  } catch (error) {
    return handleApiRouteError('POST /api/pos/webhook', error, 'POS webhook processing failed.', {
      path: '/api/pos/webhook',
    });
  }
}
