import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { apiError, apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { prisma } from '@/lib/db/prisma';
import { purchaseOrderLineKey, singleSupplierEmail } from '@/components/features/orders/supplierMail';
import { recordPurchaseOrderOpen } from '@/lib/domains/orders/purchaseOrderEmailStore';
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
    reopen: z.boolean().optional(),
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
    const toEmail = singleSupplierEmail(input.to);
    if (!toEmail) {
      return apiError('Enter one supplier email address.', 400);
    }

    const supplierId = await resolveSupplierId(input.supplierId ?? null, input.supplierName);
    if (!supplierId) {
      return apiError('A saved supplier is required before opening.', 400);
    }

    const recorded = await recordPurchaseOrderOpen(
      {
        supplierId,
        supplierName: input.supplierName,
        toEmail,
        subject: input.subject,
        body: input.body,
        lineKey: purchaseOrderLineKey({
          supplier: input.supplierName,
          productIds: input.productIds,
          body: input.body,
        }),
        actorId: actor.id,
      },
      input.reopen === true
    );

    if (!recorded.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'Already opened for this order.',
          message: 'Already opened for this order.',
          openedAt: recorded.openedAt,
          status: 'OPENED',
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      id: recorded.id,
      status: 'OPENED',
      openedAt: recorded.openedAt,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'The purchase order could not be recorded.');
  }
}
