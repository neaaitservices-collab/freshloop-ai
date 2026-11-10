import { z } from 'zod';
import { optionalSafeText, productIdSchema } from '@/lib/security/schemas/common';

export const salesPostBodySchema = z
  .object({
    productId: productIdSchema.optional(),
    quantity: z.number().finite().positive().max(1_000_000).optional(),
    location: z.enum(['floor', 'deli']).optional(),
    unitPrice: z.number().finite().min(0).max(1_000_000).optional(),
    bundleId: optionalSafeText(128),
    bundleSku: optionalSafeText(128),
    externalRef: optionalSafeText(128),
    /** When set, must be the session store. Products themselves are not store-keyed. */
    storeId: z.string().trim().min(1).max(128).optional(),
    clientMutationId: z.string().trim().min(8).max(128),
  })
  .strict()
  .superRefine((body, ctx) => {
    const hasBundle = Boolean(body.bundleId || body.bundleSku);
    if (hasBundle) return;
    if (!body.productId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'productId is required when bundleId/bundleSku are omitted.',
        path: ['productId'],
      });
    }
    if (body.quantity === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'quantity is required for product sales.',
        path: ['quantity'],
      });
    }
  });
