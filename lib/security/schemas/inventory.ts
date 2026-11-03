import { z } from 'zod';
import { optionalSafeText, productIdSchema, safeText } from '@/lib/security/schemas/common';

export const inventoryMoveBodySchema = z
  .object({
    productId: productIdSchema,
    action: z.enum(['rescue', 'waste', 'kitchen_waste', 'markdown']),
    quantity: z.number().finite().positive().max(1_000_000).optional(),
    discountPct: z.number().finite().min(0).max(100).optional(),
  })
  .strip();

export const volumetricScrapBodySchema = z
  .object({
    buckets: z.coerce.number().finite().positive().max(500),
  })
  .strip();

export const inventoryLevelsPatchSchema = z
  .object({
    productId: productIdSchema,
    action: z.enum(['rescue', 'waste', 'markdown']).optional(),
    parCases: z.number().finite().min(0).max(100_000).optional(),
    supplier: optionalSafeText(200),
    packSize: z.number().finite().positive().max(1_000_000).optional(),
    yieldDivisor: z.number().finite().positive().max(1_000_000).optional(),
    retailUnit: optionalSafeText(32),
    retailPrice: z.number().finite().min(0).max(1_000_000).optional(),
    casesOnHand: z.number().finite().min(0).max(1_000_000).optional(),
    quantity: z.number().finite().positive().max(1_000_000).optional(),
    discountPct: z.number().finite().min(0).max(100).optional(),
    department: optionalSafeText(64),
    origin: z.union([safeText(120), z.null()]).optional(),
  })
  .strict();

export const inventoryLevelsQuerySchema = z.object({
  auditProductId: productIdSchema.optional(),
  productId: productIdSchema.optional(),
  inStockOnly: z.enum(['0', '1']).optional(),
  includePosSales: z.enum(['0', '1']).optional(),
  salesDays: z.string().regex(/^\d{1,3}$/).optional(),
});
