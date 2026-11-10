import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { InventoryLocation, Prisma } from '@prisma/client';
import { InventoryLedgerError, executeBundleSale, prisma } from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { recordProductSale, resolveSaleLocation } from '@/lib/domains/inventory/recordSale';
import { isLedgerIdempotencyConflict } from '@/lib/domains/inventory/idempotencyConflict';
import {
  posSaleIdempotencyKey,
  SalePayloadConflictError,
  SaleReplayUnavailableError,
  webhookReplayDecision,
  type WebhookExpectedLine,
} from '@/lib/domains/inventory/saleIdempotency';
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
  let expected: WebhookExpectedLine[] = [];
  try {
    const body = await parseJsonBody(req, posWebhookBodySchema);
    externalRef = body.externalRef;
    const lines = body.lines;

    const outcome = await prisma.$transaction(
      async (db) => {
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${externalRef}))`;
        expected = await expectedWebhookLines(db, lines, externalRef);
        const saleKey = posSaleIdempotencyKey(externalRef);
        const existingKey = await db.ledgerIdempotencyKey.findUnique({ where: { key: saleKey } });
        const existingRows = await db.inventoryTransaction.findMany({
          where: { referenceId: externalRef },
          orderBy: { timestamp: 'asc' },
        });
        if (existingKey || existingRows.length > 0) {
          const decision = webhookReplayDecision(existingRows, expected);
          if (decision === 'mismatch') throw new SalePayloadConflictError();
          if (decision !== 'match') throw new SaleReplayUnavailableError();
          return { idempotent: true as const, results: existingRows };
        }
        await db.ledgerIdempotencyKey.create({ data: { key: saleKey } });

        const results: unknown[] = [];
        for (const line of expected) {
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
              location: line.location === InventoryLocation.Deli_Grab_N_Go ? 'deli' : 'floor',
              unitPriceOverride: line.unitPrice ?? undefined,
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
  } catch (caught) {
    let error = caught;
    if (externalRef && isLedgerIdempotencyConflict(caught)) {
      const results = await prisma.inventoryTransaction.findMany({
        where: { referenceId: externalRef },
        orderBy: { timestamp: 'asc' },
      });
      const decision = webhookReplayDecision(results, expected);
      if (decision === 'match') {
        return NextResponse.json({
          success: true,
          idempotent: true,
          processed: results.length,
          results,
        });
      }
      error = decision === 'mismatch' ? new SalePayloadConflictError() : new SaleReplayUnavailableError();
    }
    return handleApiRouteError('POST /api/pos/webhook', error, 'POS webhook processing failed.', {
      path: '/api/pos/webhook',
      referenceId: externalRef || undefined,
      operation: 'pos-webhook-ingest',
    });
  }
}

async function expectedWebhookLines(
  db: Prisma.TransactionClient,
  lines: Array<{
    productId?: string;
    externalSku?: string;
    bundleSku?: string;
    quantity?: number;
    unitPrice?: number;
    location?: 'floor' | 'deli';
  }>,
  externalRef: string
): Promise<WebhookExpectedLine[]> {
  const expected: WebhookExpectedLine[] = [];
  for (const line of lines) {
    const quantity = line.quantity ?? 1;
    if (line.bundleSku) {
      const bundle = await db.bundle.findFirst({
        where: { OR: [{ bundleSku: line.bundleSku }, { id: line.bundleSku }] },
        include: { items: { select: { productId: true, quantity: true } } },
      });
      if (!bundle) {
        throw new InventoryLedgerError(
          `Bundle "${line.bundleSku}" was not found.`,
          'BUNDLE_NOT_FOUND',
          404
        );
      }
      expected.push({
        kind: 'bundle',
        bundleSku: bundle.bundleSku,
        quantity,
        items: bundle.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      });
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
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error('Product not found.');
    expected.push({
      kind: 'product',
      productId,
      quantity,
      location: resolveSaleLocation(product, line.location),
      unitPrice: line.unitPrice ?? null,
    });
  }
  return expected;
}
