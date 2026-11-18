import { z } from 'zod';
import { numericInput } from '@/lib/security/numericInput';

export const buyForecastQuerySchema = z
  .object({
    lookbackDays: z.coerce.number().int().min(1).max(90).optional().default(7),
    leadTimeDays: numericInput(z.number().int().min(0).max(30)).optional().default(2),
    safetyDays: numericInput(z.number().int().min(0).max(30)).optional().default(1),
    seasonalFactor: z.coerce.number().finite().min(0.25).max(4).optional(),
  })
  .strict();
