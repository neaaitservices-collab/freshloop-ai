import { z } from 'zod';

export const floorBundlePromoBodySchema = z.object({
  productId: z.string().min(1).max(64),
  minUnits: z.coerce.number().finite().min(2).max(999),
  bundlePrice: z.coerce.number().finite().positive().max(999_999),
  label: z.string().max(120).optional().nullable(),
});

export const floorBundlePromoQuerySchema = z.object({
  productId: z.string().min(1).max(64).optional(),
});
