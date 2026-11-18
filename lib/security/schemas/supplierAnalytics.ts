import { z } from 'zod';
import { numericInput } from '@/lib/security/numericInput';

export const supplierAnalyticsQuerySchema = z
  .object({
    lookbackDays: z.coerce.number().int().min(7).max(90).optional().default(30),
    supplierId: z.string().trim().min(1).max(128).optional(),
    priceAlertThresholdPct: numericInput(z.number().finite().min(0).max(100)).optional(),
  })
  .strict();
