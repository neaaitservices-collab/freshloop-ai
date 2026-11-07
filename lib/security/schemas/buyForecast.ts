import { z } from 'zod';

export const buyForecastQuerySchema = z
  .object({
    lookbackDays: z.coerce.number().int().min(1).max(90).optional().default(7),
    leadTimeDays: z.coerce.number().int().min(0).max(30).optional().default(2),
    safetyDays: z.coerce.number().int().min(0).max(30).optional().default(1),
    seasonalFactor: z.coerce.number().finite().min(0.25).max(4).optional(),
  })
  .strict();
