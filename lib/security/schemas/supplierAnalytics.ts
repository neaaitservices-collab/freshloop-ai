import { z } from 'zod';

export const supplierAnalyticsQuerySchema = z
  .object({
    lookbackDays: z.coerce.number().int().min(7).max(90).optional().default(30),
    supplierId: z.string().trim().min(1).max(128).optional(),
    priceAlertThresholdPct: z.coerce.number().min(0).max(100).optional(),
  })
  .strict();
