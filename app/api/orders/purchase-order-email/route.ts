import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { apiError, apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { prisma } from '@/lib/db/prisma';
import { purchaseOrderLineKey } from '@/components/features/orders/supplierMail';
import {
  claimPurchaseOrderEmail,
  markPurchaseOrderEmailFailed,
  markPurchaseOrderEmailSent,
} from '@/lib/domains/orders/purchaseOrderEmailStore';
import {
  purchaseOrderEmailConfig,
  sendPurchaseOrderViaResend,
} from '@/lib/domains/orders/sendPurchaseOrderEmail';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

const purchaseOrderEmailSchema = z
  .object({
    supplierId: z.string().trim().min(1).max(128).nullable().optional(),
    supplierName: z.string().trim().min(1).max(200),
    to: z.string().trim().max(320),
    subject: z.string().max(300),
    body: z.string().max(20_000),
    productIds: z.array(z.string().trim().min(1).max(128)).max(200),
  })
  .strict();

async function resolveSupplierId(
  supplierId: string | null,
  supplierName: string
): Promise<string | null> {
  if (supplierId) {
    const byId = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true },
    });
    if (byId) return byId.id;
  }
  const byName = await prisma.supplier.findUnique({
    where: { name: supplierName.trim() },
    select: { id: true },
  });
  return byName?.id ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireManagerStaff();
    const limited = assertMutationRateLimit(actor.id, 'purchase-order-email', 60);
    if (limited) return limited;

    const input = await parseJsonBody(req, purchaseOrderEmailSchema);
    if (!input.to) {
      return apiError('Enter a supplier email before sending.', 400);
    }

    const config = purchaseOrderEmailConfig();
    if (!config.ok) {
      return NextResponse.json(
        {
          success: false,
          error: config.error,
          message: config.error,
          code: 'EMAIL_NOT_CONFIGURED',
        },
        { status: 503 }
      );
    }

    const supplierId = await resolveSupplierId(input.supplierId ?? null, input.supplierName);
    const lineKey = purchaseOrderLineKey({
      supplier: input.supplierName,
      productIds: input.productIds,
      body: input.body,
    });
    const claim = await claimPurchaseOrderEmail({
      supplierId,
      supplierName: input.supplierName,
      toEmail: input.to,
      fromEmail: config.from,
      replyTo: config.replyTo,
      subject: input.subject,
      body: input.body,
      lineKey,
      actorId: actor.id,
    });
    if (!claim.ok) {
      const error =
        claim.status === 'SENT'
          ? 'This purchase order was already sent.'
          : 'This purchase order is already sending.';
      return NextResponse.json(
        { success: false, error, message: error, status: claim.status },
        { status: 409 }
      );
    }

    try {
      const sent = await sendPurchaseOrderViaResend({
        apiKey: config.apiKey,
        from: config.from,
        replyTo: config.replyTo,
        to: input.to,
        subject: input.subject,
        body: input.body,
      });
      await markPurchaseOrderEmailSent(claim.id, sent.id);
      return NextResponse.json({
        success: true,
        id: claim.id,
        providerId: sent.id,
        status: 'SENT',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email could not be sent.';
      try {
        await markPurchaseOrderEmailFailed(claim.id, message);
      } catch {
        /* The provider failure is the response. */
      }
      return apiError(message, 502);
    }
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Purchase order email could not be sent.');
  }
}
