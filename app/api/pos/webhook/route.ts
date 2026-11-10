import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { InventoryLedgerError, executeBundleSale, prisma } from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { recordProductSale } from '@/lib/domains/inventory/recordSale';
import { isLedgerIdempotencyConflict } from '@/lib/domains/inventory/idempotencyConflict';
import { saleIdempotencyKey, saleStoreId } from '@/lib/domains/inventory/saleIdempotency';
import { handleApiRouteError } from '@/lib/domains/ai/apiError';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { posWebhookBodySchema } from '@/lib/security/schemas/posWebhook';
import { assertHotPathRateLimit, clientIpKey } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

const POS_WEBHOOK_ACTOR = 'pos-webhook';

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

  let externalRef = '';
  try {
    const body = await parseJsonBody(req, posWebhookBodySchema);
    externalRef = body.externalRef;
    const lines = body.lines;

    const outcome = await prisma.$transaction(
      async (db) => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${externalRef}))`;
        const saleKey = saleIdempotencyKey(await saleStoreId(db), externalRef);
        const existingKey = await db.ledgerIdempotencyKey.findUnique({ where: { key: saleKey } });
        const existing = await db.inventoryTransaction.findFirst({
          where: { referenceId: externalRef },
          select: { id: true },
        });
        if (existingKey || existing) {
          const results = await db.inventoryTransaction.findMany({
            where: { referenceId: externalRef },
            orderBy: { timestamp: 'asc' },
          });
          return { idempotent: true as const, results };
        }
        await db.ledgerIdempotencyKey.create({ data: { key: saleKey } });

        const resolved: Array<
          | { kind: 'bundle'; bundleSku: string; quantity: number }
          | {
              kind: 'product';
              productId: string;
              quantity: number;
              location: (typeof lines)[number]['location'];
              unitPrice?: number;
            }
        > = [];
        for (const line of lines) {
          const lineQty = line.quantity ?? 1;
          if (line.bundleSku) {
            resolved.push({ kind: 'bundle', bundleSku: line.bundleSku, quantity: lineQty });
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
            throw new InventoryLedgerError(
              `Unmapped POS SKU${line.externalSku ? ` ${line.externalSku}` : ''}. Nothing in this batch was posted. Map the SKU, then retry ${externalRef}.`,
              'UNMAPPED_POS_SKU',
              422
            );
          }
          resolved.push({
            kind: 'product',
            productId,
            quantity: lineQty,
            location: line.location,
            unitPrice: line.unitPrice,
          });
        }

        const results: unknown[] = [];
        for (const line of resolved) {
          if (line.kind === 'bundle') {
            results.push(
              await executeBundleSale(line.bundleSku, externalRef, {
                staffId: POS_WEBHOOK_ACTOR,
                quantitySold: line.quantity,
                db,
              })
            );
            continue;
          }
          results.push(
            await recordProductSale({
              productId: line.productId,
              quantity: line.quantity,
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
    if (externalRef && isLedgerIdempotencyConflict(error)) {
      const results = await prisma.inventoryTransaction.findMany({
        where: { referenceId: externalRef },
        orderBy: { timestamp: 'asc' },
      });
      return NextResponse.json({
        success: true,
        idempotent: true,
        processed: results.length,
        results,
      });
    }
    return handleApiRouteError('POST /api/pos/webhook', error, 'POS webhook processing failed.', {
      path: '/api/pos/webhook',
      referenceId: externalRef || undefined,
      operation: 'pos-webhook-ingest',
    });
  }
}
