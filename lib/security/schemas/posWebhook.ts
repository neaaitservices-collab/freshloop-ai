import { z } from 'zod';
import { optionalSafeText, productIdSchema } from '@/lib/security/schemas/common';

const posWebhookLineSchema = z
  .object({
    externalSku: optionalSafeText(128),
    productId: productIdSchema.optional(),
    bundleSku: optionalSafeText(128),
    quantity: z.number().finite().positive().max(1_000_000).optional().default(1),
    unitPrice: z.number().finite().min(0).max(1_000_000).optional(),
    location: z.enum(['floor', 'deli']).optional(),
  })
  .strict()
  .superRefine((line, ctx) => {
    if (line.bundleSku) return;
    if (!line.productId && !line.externalSku) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Each line requires productId, externalSku, or bundleSku.',
        path: ['productId'],
      });
    }
  });

export const posWebhookBodySchema = z
  .object({
    externalRef: z
      .string()
      .trim()
      .min(1, 'externalRef is required.')
      .max(128),
    lines: z.array(posWebhookLineSchema).min(1, 'lines array is required.').max(500),
  })
  .strict();

export type PosWebhookBody = z.output<typeof posWebhookBodySchema>;
export type PosWebhookLine = z.output<typeof posWebhookLineSchema>;
