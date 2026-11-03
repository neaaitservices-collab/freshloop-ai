import { z } from 'zod';
import { optionalSafeText, productIdSchema } from '@/lib/security/schemas/common';

export const manufacturingPostBodySchema = z
  .object({
    recipe_id: z.string().trim().min(1).max(128),
    batch_output: z.number().finite().positive().max(100_000),
    ingredient_overrides: z
      .array(
        z
          .object({
            ingredient_product_id: productIdSchema,
            actual_qty_used: z.number().finite().min(0).max(1_000_000),
          })
          .strict()
      )
      .max(200)
      .optional(),
    enforce_stock_check: z.boolean().optional(),
    notes: optionalSafeText(2000),
  })
  .strict();
